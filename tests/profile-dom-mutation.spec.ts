import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/**
 * PB-UI-DOM-INSERTBEFORE-001 — /profile mount + edit/save under
 * translator-grade DOM mutation (real-device smoke NO-GO follow-up).
 *
 * Real incidents (preview candidate 9fc3e1e, Android Chrome, auto-translate
 * active): PB-ERR-JYAHES / 7ASGSQ / TUM83T / Y7K6CV / TED84Y / GWBTKP /
 * XATCUB / 3R5CEK / 99BREQ / UC26V4 / ZHTHDH / 2G3YFK / FR77GJ —
 * NotFoundError removeChild 273-331 ms after page_viewed /profile, before
 * any interaction, component_top=div.
 *
 * Root cause (same class as the onboarding fix): async sections swap their
 * loading placeholder — [Loader2 icon + BARE text] — for content. With
 * Chrome translate having font-wrapped (detached) that text node, the
 * branch swap removes a text fiber whose DOM node is no longer a child →
 * NotFoundError. Sites fixed: loading swaps in WorkExperienceSection and
 * CertificationsSection, plus the same class in save/delete/upload/generate
 * labels across the profile sections (conditional icon insertions and icon
 * swaps anchored at bare text).
 *
 * This spec (authorized QA account, snapshot → conduct → exact restore):
 * 1. Logs in and navigates /dashboard → /profile.
 * 2. Applies the translate simulation IMMEDIATELY after first paint, BEFORE
 *    the async sections resolve (the real crash window), then again after.
 * 3. Asserts: no ErrorBoundary, zero app_error on the PostHog wire.
 * 4. Edits years of experience → saves → asserts canonical DB value.
 * 5. Reloads → asserts persistence (DB source of truth).
 * 6. Restores the QA profile to the exact snapshot (zero diffs).
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const redact = (v: unknown) => (typeof v === 'string' && v.length > 8 ? `${v.slice(0, 8)}…` : v);

const PROFILES_TABLE = 'app_14da0f1941_profiles';
const IGNORED_DIFF_COLUMNS = new Set(['updated_at']);

const EDIT_COLUMNS = [
  'full_name',
  'title',
  'company',
  'location',
  'years_experience',
  'skills',
  'bio',
] as const;

interface RestCtx {
  base: string;
  apiKey: string;
  authorization: string;
}

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

test.describe('PB-UI-DOM-INSERTBEFORE-001 /profile under translator-grade DOM mutation (preview, SHA-locked)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping /profile DOM-mutation E2E');

  test('mount + edit years + save + reload survive Chrome-translate DOM mutation; zero app_error; canonical save; exact restore', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const emailTrimmed = (EMAIL ?? '').trim();
    expect(
      emailTrimmed,
      'the disposable account must be in the internal qa* test namespace on pipingbox.com',
    ).toMatch(/^qa[^@]*@pipingbox\.com$/i);

    // Language determinism — same rationale as the onboarding specs.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_language', 'es');
      } catch {
        /* storage unavailable */
      }
    });

    const browserErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') browserErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', (err) => browserErrors.push('pageerror: ' + String(err).slice(0, 300)));

    const payloads: Buffer[] = [];
    page.on('request', (req) => {
      if (req.url().includes('posthog.com') && req.method() === 'POST') {
        const buf = req.postDataBuffer();
        if (buf) payloads.push(buf);
      }
    });

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

    // ── 1. Pre-flight: served build must match the expected SHA ──────────
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4500);

    const expectedVersion = process.env.EXPECTED_APP_VERSION ?? '';
    const expectedEnv = process.env.EXPECTED_ENV ?? 'preview';
    const preFlight = decodeAll();
    expect(
      preFlight.length,
      'pre-flight requires at least one flushed event from the login page',
    ).toBeGreaterThan(0);
    for (const e of preFlight) {
      const p = (e.properties ?? {}) as Record<string, unknown>;
      expect(String(p.environment), `served environment must be ${expectedEnv}`).toBe(expectedEnv);
      if (expectedVersion) {
        expect(
          String(p.app_version),
          'ABORT: served app_version does not match the expected SHA',
        ).toBe(expectedVersion);
      }
    }

    // ── 2. Login → /dashboard ────────────────────────────────────────────
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
    function distinctIdOf(e: Record<string, unknown>): string {
      const p = (e.properties ?? {}) as Record<string, unknown>;
      return String(e.distinct_id ?? p.distinct_id ?? '');
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
      const res = await fetch(profileUrl, { headers: restHeaders, signal: AbortSignal.timeout(15_000) });
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
        signal: AbortSignal.timeout(20_000),
      });
      expect(res.ok, `recalculate-profiles failed: HTTP ${res.status}`).toBeTruthy();
    };

    // ── 3. Snapshot + preflight ──────────────────────────────────────────
    const snapshot = await readProfile();
    expect(snapshot.role, "preflight: role must be 'worker'").toBe('worker');
    expect(snapshot.account_type, 'preflight: admin accounts are untouchable').not.toBe('admin');
    const snapshotYears = snapshot.years_experience === null || snapshot.years_experience === undefined
      ? null
      : Number(snapshot.years_experience);
    const editedYears = snapshotYears === 7 ? 8 : 7; // always a change vs snapshot

    let restoreDone = false;
    let restoreDiffColumns: string[] = [];
    try {
      // ── 4. /dashboard → /profile, translate in the real crash window ───
      await page.goto('/profile');
      // Translate IMMEDIATELY after first paint, before async sections
      // resolve their fetches (the real incidents crashed 273-331 ms after
      // page_viewed, before any interaction).
      await page.locator('#root').first().waitFor({ state: 'attached', timeout: 15_000 });
      const mutatedAtPaint = await page.evaluate(TRANSLATE_SIM);
      console.log(`translate-sim at first paint: ${mutatedAtPaint} nodes font-wrapped`);

      // Wait for async sections to finish loading (years input is rendered
      // by the static form; the Work Experience section header proves the
      // async sections resolved).
      await expect(
        page.locator('input[type="number"]').first(),
        'years-of-experience input must render on /profile',
      ).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(4000); // allow every section fetch to resolve

      const boundaryVisible = () =>
        page
          .getByText(/Código de incidencia|Incident code/i)
          .first()
          .isVisible()
          .catch(() => false);

      expect(
        await boundaryVisible(),
        '/profile mount under translate-mutated DOM must NOT crash into the ErrorBoundary (PB-ERR removeChild)',
      ).toBe(false);

      // Chrome keeps translating newly inserted DOM.
      const mutatedAfterLoad = await page.evaluate(TRANSLATE_SIM);
      console.log(`translate-sim after sections resolved: ${mutatedAfterLoad} nodes font-wrapped`);
      expect(
        await boundaryVisible(),
        '/profile must still be alive after re-translation of the loaded content',
      ).toBe(false);
      console.log('mount PASS: /profile alive through the incident crash window');

      // ── 5. Edit years of experience → save (under mutated DOM) ─────────
      // Deterministic inventory + driver-level fill: the React-controlled
      // input is set through the native value setter + input event (same
      // mechanism as the proven harness), which is immune to whichever
      // number input Playwright actionability decides to target on a large
      // font-wrapped page.
      const numberInputs = await page.evaluate(() =>
        [...document.querySelectorAll('form input[type=number]')].map((el) => {
          const i = el as HTMLInputElement;
          const form = i.closest('form');
          return {
            name: i.name, value: i.value, disabled: i.disabled,
            formIndex: [...document.querySelectorAll('form')].indexOf(form as HTMLFormElement),
          };
        }),
      );
      console.log('DIAG number inputs:', JSON.stringify(numberInputs));
      console.log('phase: filling years input (native setter)');
      const fillResult = await page.evaluate((val) => {
        const i = document.querySelector('form input[type=number]') as HTMLInputElement | null;
        if (!i) return 'NF';
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        set.call(i, val);
        i.dispatchEvent(new Event('input', { bubbles: true }));
        return 'ok:' + i.value;
      }, String(editedYears));
      console.log('phase: years filled ->', fillResult);
      const preClickDiag = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('form button[type=submit]')];
        const saveBtn = btns.find((b) => /Guardar perfil/i.test(b.textContent ?? ''));
        const form = document.querySelector('form');
        const years = document.querySelector('form input[type=number]');
        const invalid = form
          ? [...form.querySelectorAll('input,textarea,select')].filter((el) => !(el as HTMLInputElement).checkValidity() && !(el as HTMLInputElement).disabled).map((el) => (el as HTMLInputElement).name + ':' + (el as HTMLInputElement).type + ':' + String((el as HTMLInputElement).value).slice(0, 20))
          : [];
        return {
          btnFound: !!saveBtn,
          btnDisabled: saveBtn?.disabled ?? null,
          yearsValue: (years as HTMLInputElement | null)?.value ?? null,
          formValid: form?.checkValidity() ?? null,
          invalid,
        };
      });
      console.log('DIAG pre-click:', JSON.stringify(preClickDiag));

      // The save-status banner swap + button label swap must not crash.
      // In-page click on the submit button: dispatches the real form
      // submit (handleSave -> real upsert -> canonical state) and is
      // immune to synthetic hit-point issues on the mutated page. This is
      // the mechanism proven against the real component in the harness.
      const saveClick = await page.evaluate(() => {
        const b = [...document.querySelectorAll('form button[type=submit]')].find((x) =>
          /Guardar perfil/i.test(x.textContent ?? ''),
        );
        if (!b) return 'NF';
        (b as HTMLButtonElement).click();
        return 'ok';
      });
      console.log('phase: save clicked ->', saveClick, ', waiting for saved status');

      try {
        await expect(
          page.getByText(/Guardado/i).first(),
          'save status must reach the canonical "saved" state (no false success)',
        ).toBeVisible({ timeout: 15_000 });
      } catch (err) {
        // Diagnostics: what did the status region actually show? Did the
        // upsert error out (saveError) or did submit never fire?
        const statusText = await page
          .evaluate(() => {
            const form = document.querySelector('form');
            const footer = form
              ? [...form.querySelectorAll('button[type=submit]')].map((b) => b.closest('div')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200)).join(' | ')
              : 'NO FORM';
            const errEls = [...document.querySelectorAll('.text-red-400, .text-red-500')].map((e) => e.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).join(' | ');
            return { footer, errEls };
          })
          .catch(() => ({ footer: 'eval failed', errEls: '' }));
        console.log('DIAG status region:', JSON.stringify(statusText));
        console.log('DIAG browser errors:', JSON.stringify(browserErrors.slice(0, 8)));
        throw err;
      }
      console.log('phase: saved status visible');
      expect(await boundaryVisible(), 'save under mutated DOM must not crash').toBe(false);

      // ── 6. Canonical state: DB must hold the edited value ──────────────
      console.log('phase: reading canonical profile from DB');
      const afterSave = await readProfile();
      console.log('phase: canonical profile read');
      expect(
        Number(afterSave.years_experience),
        'canonical state: years_experience must be persisted in DB',
      ).toBe(editedYears);
      console.log(`save PASS: canonical years_experience=${editedYears} confirmed in DB`);

      // ── 7. Reload → persistence from DB (source of truth) ─────────────
      console.log('phase: reloading page');
      await page.reload({ waitUntil: 'networkidle' });
      console.log('phase: reloaded');
      await page.waitForTimeout(2500);
      const mutatedAfterReload = await page.evaluate(TRANSLATE_SIM);
      console.log(`translate-sim after reload: ${mutatedAfterReload} nodes font-wrapped`);
      await expect(
        page.locator('input[type="number"]').first(),
        'years input must re-render after reload',
      ).toHaveValue(String(editedYears), { timeout: 30_000 });
      expect(await boundaryVisible(), 'reload under mutated DOM must not crash').toBe(false);
      console.log('reload PASS: edited value persisted and re-rendered from DB');

      // ── 8. Wire assertions: zero app_error on /profile ────────────────
      await page.waitForTimeout(4500); // past the 3s batch flush
      const decoded = decodeAll();
      const profileErrors = decoded.filter((e) => {
        if (e.event !== 'app_error') return false;
        const p = (e.properties ?? {}) as Record<string, unknown>;
        return String(p.route ?? '').includes('/profile');
      });
      expect(
        profileErrors,
        `zero app_error on /profile allowed; got ${JSON.stringify(profileErrors.map((e) => (e.properties as Record<string, unknown>)?.incident_code))}`,
      ).toHaveLength(0);
      for (const e of decoded) {
        expect(JSON.stringify(e)).not.toContain('@');
      }
      console.log('wire PASS: app_error=0 on /profile, zero PII in payloads');
    } finally {
      // ── 9. Restore (ALWAYS) and verify ZERO diff vs the snapshot ──────
      try {
        const restoreBody: Record<string, unknown> = {};
        for (const col of EDIT_COLUMNS) {
          if (col in snapshot) restoreBody[col] = snapshot[col];
        }
        const restoreRes = await fetch(profileUrl, {
          method: 'PATCH',
          headers: { ...restHeaders, Prefer: 'return=representation' },
          body: JSON.stringify(restoreBody),
          signal: AbortSignal.timeout(15_000),
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
      console.log(`QA account restored (run context ${redact(identifiedId)})`);
    }
    expect(restoreDone, 'restore must have succeeded').toBeTruthy();
    expect(restoreDiffColumns, 'restore must leave ZERO differences vs the snapshot').toHaveLength(0);
  });
});
