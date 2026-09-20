import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/**
 * PB-UI-DOM-INSERTBEFORE-001 — DOM-mutation (auto-translate) regression.
 *
 * Reproduces the production incident class PB-ERR-66M3UM / PB-ERR-5WEP55 /
 * PB-ERR-WBS9V9 (NotFoundError "Failed to execute 'insertBefore' on 'Node'"
 * at onboarding step 1 -> 2, Android/desktop Chrome, app cccf0d0).
 *
 * Root cause (demonstrated): Chrome's built-in page translation wraps every
 * text node in <font> elements, detaching the nodes React still references.
 * The Omitir <-> Atrás nav buttons are the same <button> fiber, so at step
 * 1 -> 2 React swapped the lucide icon (X -> ChevronLeft) with insertBefore
 * anchored at the adjacent (now detached) text node and the commit threw.
 * Same class at step 3: `{cond && <Check/>}text` inserted the icon before a
 * bare text node. The fix keys the two nav buttons (full unmount/mount,
 * element-level ops) and anchors the Check insertion at a <span> element.
 *
 * This spec simulates the translator deterministically: it font-wraps every
 * text node inside the wizard (exactly Chrome's mutation shape) and then
 * drives the incident transition plus the adjacent fragile interactions.
 * Pre-fix the step 1 -> 2 click crashes into the ErrorBoundary (app_error
 * on the wire, wizard dead); post-fix the wizard must stay fully
 * operational, preserve the draft, and emit ZERO app_error events.
 *
 * Runs in the same isolated, SHA-locked window as
 * observability-onboarding-e2e.spec.ts (auth-e2e.yml, run_onboarding_e2e),
 * reusing the authorized one-shot QA-account reset + exact restore.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const redact = (v: unknown) => (typeof v === 'string' && v.length > 8 ? `${v.slice(0, 8)}…` : v);

const COMPLETED_STATUSES = ['PROFILE_COMPLETED', 'MARKETPLACE_READY'];
const PROFILES_TABLE = 'app_14da0f1941_profiles';
const COUNT_TABLES = [
  'app_worker_experiences',
  'app_worker_certifications',
  'app_worker_documents',
] as const;

const RESET_NULL_COLUMNS = [
  'title',
  'company',
  'location',
  'years_experience',
  'skills',
  'bio',
  'avatar_url',
] as const;

const RESTORE_COLUMNS = [
  ...RESET_NULL_COLUMNS,
  'full_name',
  'account_type',
  'role',
  'availability_status',
  'willing_to_travel',
  'willing_to_relocate',
  'cv_visible',
  'profile_visibility',
] as const;

const IGNORED_DIFF_COLUMNS = new Set(['updated_at']);

interface RestCtx {
  base: string;
  apiKey: string;
  authorization: string;
}

/**
 * Chrome translate simulation: wrap every visible text node of the wizard in
 * <font style="vertical-align: inherit;">, detaching the originals that
 * React still holds pointers to. Returns how many nodes were mutated.
 */
const TRANSLATE_SIM = `(() => {
  const root = document.getElementById('root');
  if (!root) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const font = document.createElement('font');
    font.style.verticalAlign = 'inherit';
    font.textContent = n.nodeValue;
    n.parentNode.replaceChild(font, n);
  }
  return nodes.length;
})()`;

test.describe('PB-UI-DOM-INSERTBEFORE-001 onboarding under translator-grade DOM mutation (preview, SHA-locked)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping DOM-mutation onboarding E2E');

  test('step 1->2 and step-3 toggles survive Chrome-translate DOM mutation; no app_error; draft preserved; exact restore', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const emailTrimmed = (EMAIL ?? '').trim();
    expect(
      emailTrimmed,
      'the disposable account must be in the internal qa* test namespace on pipingbox.com',
    ).toMatch(/^qa[^@]*@pipingbox\.com$/i);

    // Language determinism: the wizard copy is localized; the runner's
    // navigator.language is NOT a stable input (the funnel spec once passed
    // on an environment where the browser resolved Spanish and failed when
    // it resolved English). Pin the same scenario as the production
    // incidents: Spanish UI.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_language', 'es');
      } catch {
        /* storage unavailable */
      }
    });

    // PostHog wire capture (gzip batches).
    const payloads: Buffer[] = [];
    page.on('request', (req) => {
      if (req.url().includes('posthog.com') && req.method() === 'POST') {
        const buf = req.postDataBuffer();
        if (buf) payloads.push(buf);
      }
    });

    // Supabase REST context from the app's own requests (never printed).
    let rest: RestCtx | null = null;
    page.on('request', (req) => {
      const url = req.url();
      if (!rest && url.includes('/rest/v1/')) {
        const h = req.headers();
        if (h['apikey'] && h['authorization']) {
          rest = { base: url.split('/rest/v1/')[0], apiKey: h['apikey'], authorization: h['authorization'] };
        }
      }
    });

    const decodeAll = (): Record<string, unknown>[] =>
      payloads.flatMap((buf) => {
        let text: string;
        try {
          text = gunzipSync(buf).toString('utf8');
        } catch {
          text = buf.toString('utf8');
        }
        try {
          const json = JSON.parse(text) as Record<string, unknown> & { batch?: unknown[] };
          return (json.batch ?? [json]) as Record<string, unknown>[];
        } catch {
          return [];
        }
      });

    const distinctIdOf = (e: Record<string, unknown>): string => {
      const p = (e.properties ?? {}) as Record<string, unknown>;
      return String(e.distinct_id ?? p.distinct_id ?? '');
    };

    // ── 1. Pre-flight: served build must match the expected SHA ──────────
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4500);

    const expectedVersion = process.env.EXPECTED_APP_VERSION ?? '';
    const preFlight = decodeAll();
    expect(
      preFlight.length,
      'pre-flight requires at least one flushed event from the login page',
    ).toBeGreaterThan(0);
    for (const e of preFlight) {
      const p = (e.properties ?? {}) as Record<string, unknown>;
      expect(String(p.environment), 'served environment must be preview').toBe('preview');
      if (expectedVersion) {
        expect(
          String(p.app_version),
          'ABORT: served app_version does not match the expected SHA',
        ).toBe(expectedVersion);
      }
    }

    // ── 2. Login ─────────────────────────────────────────────────────────
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    let identifiedId = '';
    for (let i = 0; i < 10 && !identifiedId; i++) {
      await page.waitForTimeout(1000);
      const id = decodeAll().find((e) => e.event === '$identify');
      if (id) {
        const p = (id.properties ?? {}) as Record<string, unknown>;
        identifiedId = String(p.$identified_id ?? distinctIdOf(id));
      }
    }
    expect(identifiedId, 'exactly one $identify must flush after login').toMatch(UUID_RE);
    expect(identifiedId).not.toContain('@');

    expect(rest, 'Supabase REST context must have been captured').toBeTruthy();
    const restCtx = rest!;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };
    const profileUrl = `${restCtx.base}/rest/v1/${PROFILES_TABLE}?select=*&user_id=eq.${identifiedId}`;

    const readProfile = async (): Promise<Record<string, unknown>> => {
      const res = await fetch(profileUrl, { headers: restHeaders });
      expect(res.ok, `profile fetch failed: HTTP ${res.status}`).toBeTruthy();
      const rows = (await res.json()) as Record<string, unknown>[];
      expect(rows.length, 'QA account must have exactly one profile row').toBe(1);
      return rows[0];
    };

    const recalculateOwn = async (): Promise<void> => {
      const res = await fetch(`${restCtx.base}/functions/v1/recalculate-profiles`, {
        method: 'POST',
        headers: { Authorization: restCtx.authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: identifiedId }),
      });
      expect(res.ok, `recalculate-profiles failed: HTTP ${res.status}`).toBeTruthy();
      const body = (await res.json()) as { updated?: number };
      expect(body.updated, 'recalculate-profiles must report exactly one updated profile').toBe(1);
    };

    // ── 3. Snapshot + preflight (abort BEFORE touching anything) ────────
    const snapshot = await readProfile();
    expect(snapshot.role, "preflight: role must be 'worker'").toBe('worker');
    expect(snapshot.account_type, 'preflight: admin accounts are untouchable').not.toBe('admin');
    for (const table of COUNT_TABLES) {
      const res = await fetch(
        `${restCtx.base}/rest/v1/${table}?select=user_id&user_id=eq.${identifiedId}`,
        { headers: restHeaders },
      );
      expect(res.ok, `preflight count failed on ${table}: HTTP ${res.status}`).toBeTruthy();
      const rows = (await res.json()) as unknown[];
      expect(rows.length, `preflight abort: the QA account has ${table} rows`).toBe(0);
    }

    let restoreDone = false;
    let restoreDiffColumns: string[] = [];
    try {
      // ── 4. Authorized reset (whenever the gate would NOT show) ────────
      const gateWouldShow =
        !COMPLETED_STATUSES.includes(String(snapshot.onboarding_status)) &&
        (!(snapshot.title && snapshot.location) ||
          snapshot.role === 'user' ||
          !snapshot.account_type);
      if (!gateWouldShow) {
        const resetBody: Record<string, unknown> = {};
        for (const col of RESET_NULL_COLUMNS) resetBody[col] = null;
        const resetRes = await fetch(profileUrl, {
          method: 'PATCH',
          headers: { ...restHeaders, Prefer: 'return=representation' },
          body: JSON.stringify(resetBody),
        });
        expect(resetRes.ok, `reset PATCH failed: HTTP ${resetRes.status}`).toBeTruthy();
        expect(((await resetRes.json()) as unknown[]).length, 'reset must affect exactly one row').toBe(1);
        await recalculateOwn();
        const afterReset = await readProfile();
        expect(String(afterReset.onboarding_status), 'reset must derive AUTH_ONLY').toBe('AUTH_ONLY');
        console.log('authorized reset applied: AUTH_ONLY');
      }

      // ── 5. Wizard appears ──────────────────────────────────────────────
      await page.evaluate((uid) => localStorage.removeItem(`pipingbox_onboarding_draft_${uid}`), identifiedId);
      await page.reload({ waitUntil: 'networkidle' });
      await expect(
        page.getByText('¿Qué tipo de cuenta necesitas?'),
        'onboarding wizard must appear (pre-onboarding canonical status)',
      ).toBeVisible({ timeout: 30_000 });

      const boundaryVisible = () =>
        page
          .getByText(/Código de incidencia|Incident code/i)
          .first()
          .isVisible()
          .catch(() => false);

      const draftStep = () =>
        page.evaluate((uid) => {
          const raw = localStorage.getItem(`pipingbox_onboarding_draft_${uid}`);
          return raw ? (JSON.parse(raw) as { step?: number }).step ?? null : null;
        }, identifiedId);

      // ── 6. Chrome translates the page (text nodes font-wrapped) ────────
      const mutated1 = await page.evaluate(TRANSLATE_SIM);
      expect(mutated1, 'translate simulation must mutate wizard text nodes').toBeGreaterThan(0);
      console.log(`translate-sim: ${mutated1} text nodes font-wrapped at step 1`);

      // ── 7. INCIDENT TRANSITION: step 1 -> 2 under mutated DOM ─────────
      // force: the <font> wrapper intercepts hit-targets; real taps bubble.
      await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
      await page.waitForTimeout(800);
      expect(
        await boundaryVisible(),
        'step 1 -> 2 under translate-mutated DOM must NOT crash into the ErrorBoundary (PB-ERR insertBefore)',
      ).toBe(false);
      await expect(
        page.getByText('¿Cuál es tu rol principal?'),
        'step 2 must render after the incident transition',
      ).toBeVisible({ timeout: 10_000 });
      expect(await draftStep(), 'draft must record the step-2 progress').toBe(2);
      console.log('incident transition PASS: step 1 -> 2 with mutated DOM, no crash, draft at step 2');

      // ── 8. Role selection + double-click + step 2 -> 3 ────────────────
      await page.getByRole('button', { name: 'Welder', exact: true }).click({ force: true });
      const nextBtn = page.getByRole('button', { name: 'Siguiente' });
      await nextBtn.click({ force: true });
      await nextBtn.click({ force: true }).catch(() => undefined); // double-click tolerance
      await page.waitForTimeout(600);
      expect(await boundaryVisible(), 'double-click must not crash the wizard').toBe(false);
      await expect(page.getByText('Selecciona tus especialidades')).toBeVisible({ timeout: 10_000 });

      // Chrome keeps translating newly inserted DOM: re-wrap step-3 nodes.
      const mutated3 = await page.evaluate(TRANSLATE_SIM);
      console.log(`translate-sim: ${mutated3} text nodes font-wrapped at step 3`);

      // ── 9. Specialty toggles (Check icon insertions) under mutation ────
      await page.getByRole('button', { name: 'Welding', exact: true }).click({ force: true });
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Piping', exact: true }).click({ force: true });
      await page.waitForTimeout(400);
      expect(
        await boundaryVisible(),
        'specialty toggles under translate-mutated DOM must NOT crash (Check insertBefore anchor)',
      ).toBe(false);

      // ── 10. Fast back/forward (icon-swap stress) ───────────────────────
      await page.getByRole('button', { name: /Atrás/ }).first().click({ force: true });
      await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
      await page.waitForTimeout(600);
      expect(await boundaryVisible(), 'fast back/forward must not crash the wizard').toBe(false);
      await expect(page.getByText('Selecciona tus especialidades')).toBeVisible({ timeout: 10_000 });
      const finalDraftStep = await draftStep();
      expect(finalDraftStep, 'draft must be preserved through the mutated interactions').toBe(3);
      console.log('back/forward PASS: wizard alive, draft preserved at step 3');

      // ── 11. Wire assertions: zero app_error, clean funnel ──────────────
      await page.waitForTimeout(4500); // past the 3s batch flush
      const decoded = decodeAll();
      const appErrors = decoded.filter((e) => e.event === 'app_error');
      expect(
        appErrors,
        `zero app_error events allowed; got ${JSON.stringify(appErrors.map((e) => (e.properties as Record<string, unknown>)?.error_name))}`,
      ).toHaveLength(0);

      const started = decoded.filter((e) => e.event === 'onboarding_started');
      expect(started, 'onboarding_started exactly once (no re-render duplicates)').toHaveLength(1);

      const stepEvents = decoded.filter((e) => e.event === 'onboarding_step_reached');
      const stepSeq = stepEvents.map((e) => (e.properties as Record<string, unknown>).step as number);
      expect(new Set(stepSeq).size, 'onboarding_step_reached without duplicates').toBe(stepSeq.length);
      expect(stepSeq[0], 'funnel starts at step 1').toBe(1);

      const completed = decoded.filter((e) => e.event === 'onboarding_completed');
      expect(completed, 'onboarding_completed must NOT fire without canonical finalization').toHaveLength(0);

      for (const e of [...started, ...stepEvents]) {
        const serialized = JSON.stringify(e);
        expect(serialized).not.toContain('@');
      }
      console.log(
        `wire PASS: started=1 steps=[${stepSeq.join(',')}] completed=0 app_error=0 (correlation redacted)`,
      );
    } finally {
      // ── 12. Restore (ALWAYS) and verify ZERO diff vs the snapshot ─────
      try {
        const restoreBody: Record<string, unknown> = {};
        for (const col of RESTORE_COLUMNS) {
          if (col in snapshot) restoreBody[col] = snapshot[col];
        }
        const restoreRes = await fetch(profileUrl, {
          method: 'PATCH',
          headers: { ...restHeaders, Prefer: 'return=representation' },
          body: JSON.stringify(restoreBody),
        });
        expect(restoreRes.ok, `restore PATCH failed: HTTP ${restoreRes.status}`).toBeTruthy();
        expect(((await restoreRes.json()) as unknown[]).length, 'restore must affect exactly one row').toBe(1);

        await recalculateOwn();

        const finalRow = await readProfile();
        restoreDiffColumns = Object.keys(snapshot).filter(
          (col) =>
            !IGNORED_DIFF_COLUMNS.has(col) &&
            JSON.stringify(snapshot[col]) !== JSON.stringify(finalRow[col]),
        );
        restoreDone = true;
        console.log(
          `restore verified: ${restoreDiffColumns.length === 0 ? 'ZERO diffs' : `DIFFS in ${restoreDiffColumns.join(', ')}`} (updated_at excluded)`,
        );
      } catch (err) {
        console.log(`restore FAILED — QA account NOT fully restored: ${String(err)}`);
      }
      await page
        .evaluate((uid) => localStorage.removeItem(`pipingbox_onboarding_draft_${uid}`), identifiedId)
        .catch(() => undefined);
      console.log(`QA account restored (run context ${redact(identifiedId)})`);
    }
    expect(restoreDone, 'restore must have succeeded').toBeTruthy();
    expect(restoreDiffColumns, 'restore must leave ZERO differences vs the snapshot').toHaveLength(0);
  });
});
