import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/**
 * PB-UI-DOM-INSERTBEFORE-001 / PB-PDI-004 — /dashboard pending-invitation
 * action under translator-grade DOM mutation.
 *
 * Real incidents (production build cccf0d0, 2026-09-25 17:24:30-42
 * Europe/Brussels, Android Chrome, auto-translate, correlation
 * ecf1b695-6728-4dcd-814e-bfa4d690fca0): 8 consecutive app_error —
 * PB-ERR-WDNH8A / E5TUWW / VTYMPX / NC9SVT / UXSB62 / U4YF69 / UZV9EV /
 * JVNEDN — NotFoundError insertBefore on /dashboard, component_top
 * utils-vendor (lucide). The user retried the same action after each
 * ErrorBoundary "Reintentar" (the boundary has NO auto-retry; one app_error
 * per componentDidCatch, same session correlation ID).
 *
 * Root cause (demonstrated in the hermetic harness against the real
 * component): PendingInvitationsWidget's Accept button swaps its content
 * [<Check icon> + BARE text] -> [<Loader2/>] when actionLoading flips.
 * Chrome Translate had font-wrapped (detached) the bare label text node, so
 * the swap removes/anchors against a text fiber whose DOM node is no longer
 * a child -> NotFoundError. Fix: keyed element branches + span-wrapped
 * labels (same structural defense as the onboarding and /profile fixes).
 *
 * This spec (authorized QA account, hermetic data, ZERO DB writes):
 * 1. Intercepts the PostgREST calls of the widget with a single SYNTHETIC
 *    invitation (no real invitations exist for the QA account; the action
 *    PATCH is mocked too, so nothing is ever written).
 * 2. Logs in, lands on /dashboard, waits for the invitation card.
 * 3. Applies the translate simulation (font-wrap of every text node),
 *    taps "Aceptar", re-applies, and asserts:
 *    - no ErrorBoundary, zero app_error on the PostHog wire for /dashboard;
 *    - the widget completes the action (invitation resolved -> list empty).
 * 4. Verifies the QA profile row is bit-identical before/after (read-only).
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const PROFILES_TABLE = 'app_14da0f1941_profiles';
const INVITATIONS_TABLE = 'app_14da0f1941_job_invitations';
const JOBS_TABLE = 'app_14da0f1941_jobs';
const IGNORED_DIFF_COLUMNS = new Set(['updated_at']);

const SYNTHETIC_INVITATION = {
  id: 'qa-synthetic-inv-001',
  job_id: 'qa-synthetic-job-001',
  company_user_id: 'qa-synthetic-company-001',
  message: null,
  status: 'pending',
  created_at: '2026-09-25T15:00:00.000Z',
};

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

test.describe('PB-UI-DOM-INSERTBEFORE-001 /dashboard invitation action under translator-grade DOM mutation (preview, SHA-locked)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping /dashboard DOM-mutation E2E');

  test('Accept tap under font-wrapped DOM must not crash; widget resolves; zero app_error; zero DB writes', async ({
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

    // ── 0. Hermetic data: synthetic invitation, ZERO DB writes ─────────
    // Registered before navigation so the widget's first fetch is served.
    // Everything not related to the synthetic rows falls through untouched.
    const jsonHeaders = { 'content-type': 'application/json' };
    await page.route(`**/rest/v1/${INVITATIONS_TABLE}*`, (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify([SYNTHETIC_INVITATION]) });
      }
      if (req.method() === 'PATCH' && req.url().includes(`id=eq.${SYNTHETIC_INVITATION.id}`)) {
        return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify([{ ...SYNTHETIC_INVITATION, status: 'accepted' }]) });
      }
      return route.fallback();
    });
    await page.route(`**/rest/v1/${JOBS_TABLE}*`, (route) => {
      const req = route.request();
      if (req.method() === 'GET' && req.url().includes(`id=eq.${SYNTHETIC_INVITATION.job_id}`)) {
        return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ title: 'QA Synthetic Role', location: 'Antwerp' }) });
      }
      return route.fallback();
    });
    await page.route(`**/rest/v1/${PROFILES_TABLE}*`, (route) => {
      const req = route.request();
      if (req.method() === 'GET' && req.url().includes(`user_id=eq.${SYNTHETIC_INVITATION.company_user_id}`)) {
        return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ full_name: null, company_name: 'QA Synthetic Co' }) });
      }
      return route.fallback();
    });

    // ── 1. Pre-flight: served build must match the expected SHA ────────
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

    // ── 2. Login → /dashboard ──────────────────────────────────────────
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    expect(rest, 'Supabase REST context must have been captured').toBeTruthy();
    const restCtx = rest!;
    const restHeaders = {
      apikey: restCtx.apiKey,
      Authorization: restCtx.authorization,
      'Content-Type': 'application/json',
    };

    // Identify the QA user's uuid from the wire ($identify), as in the
    // other isolated-window specs.
    let identifiedId = '';
    for (let i = 0; i < 10 && !identifiedId; i++) {
      await page.waitForTimeout(1000);
      const id = decodeAll().find((e) => e.event === '$identify');
      if (id) {
        const p = (id.properties ?? {}) as Record<string, unknown>;
        identifiedId = String(p.$identified_id ?? e.distinct_id ?? p.distinct_id ?? '');
      }
    }
    expect(identifiedId, 'exactly one $identify must flush after login').toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const profileUrl = `${restCtx.base}/rest/v1/${PROFILES_TABLE}?select=*&user_id=eq.${identifiedId}`;
    const readProfile = async (): Promise<Record<string, unknown>> => {
      const res = await fetch(profileUrl, { headers: restHeaders, signal: AbortSignal.timeout(15_000) });
      expect(res.ok, `profile fetch failed: HTTP ${res.status}`).toBeTruthy();
      const rows = (await res.json()) as Record<string, unknown>[];
      expect(rows.length, 'QA account must have exactly one profile row').toBe(1);
      return rows[0];
    };

    // Snapshot for the read-only zero-diff check (this spec writes NOTHING).
    const snapshot = await readProfile();
    expect(snapshot.role, "preflight: role must be 'worker'").toBe('worker');
    expect(snapshot.account_type, 'preflight: admin accounts are untouchable').not.toBe('admin');

    try {
      // ── 3. Invitation card renders from the hermetic interception ────
      const acceptButton = page.locator('button', { hasText: 'Aceptar' }).first();
      await expect(
        acceptButton,
        'synthetic pending invitation must render its Accept button on /dashboard',
      ).toBeVisible({ timeout: 30_000 });

      // ── 4. Translate-sim over the rendered widget, then tap Accept ───
      const mutated1 = await page.evaluate(TRANSLATE_SIM);
      console.log(`translate-sim before tap: ${mutated1} nodes font-wrapped`);

      const boundaryVisible = () =>
        page
          .getByText(/Código de incidencia|Incident code/i)
          .first()
          .isVisible()
          .catch(() => false);

      // In-page click (mechanism proven in the harness): immune to
      // synthetic hit-point issues on the font-wrapped page.
      const tapped = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) =>
          /Aceptar/i.test(x.textContent ?? ''),
        );
        if (!b) return 'NF';
        (b as HTMLButtonElement).click();
        return 'ok';
      });
      expect(tapped, 'Accept button must be clickable under mutated DOM').toBe('ok');

      // The action resolves: the invitation leaves the list and, with an
      // empty list, the widget unmounts (returns null).
      await expect(
        page.locator('button', { hasText: 'Aceptar' }),
        'accepted invitation must leave the pending list (widget operational, no false state)',
      ).toHaveCount(0, { timeout: 15_000 });

      expect(
        await boundaryVisible(),
        '/dashboard invitation action under translate-mutated DOM must NOT crash into the ErrorBoundary (PB-PDI-004)',
      ).toBe(false);

      // Chrome keeps translating newly inserted DOM (toast, reflows).
      const mutated2 = await page.evaluate(TRANSLATE_SIM);
      console.log(`translate-sim after action: ${mutated2} nodes font-wrapped`);
      await page.waitForTimeout(1500);
      expect(
        await boundaryVisible(),
        '/dashboard must still be alive after re-translation post-action',
      ).toBe(false);
      console.log('action PASS: Accept completed under mutated DOM, no boundary');

      // ── 5. Retry-loop sanity: no automatic boundary loop is possible ─
      // Reload with mutation and confirm the dashboard mounts clean again
      // (the production loop was user-driven; the app itself must recover).
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      const mutated3 = await page.evaluate(TRANSLATE_SIM);
      console.log(`translate-sim after reload: ${mutated3} nodes font-wrapped`);
      await page.waitForTimeout(2000);
      expect(await boundaryVisible(), 'reload under mutated DOM must not crash').toBe(false);
      console.log('remount PASS: /dashboard alive after reload + mutation');

      // ── 6. Wire assertions: zero app_error on /dashboard, zero PII ───
      await page.waitForTimeout(4500); // past the 3s batch flush
      const decoded = decodeAll();
      const dashboardErrors = decoded.filter((e) => {
        if (e.event !== 'app_error') return false;
        const p = (e.properties ?? {}) as Record<string, unknown>;
        return String(p.route ?? '').includes('/dashboard');
      });
      expect(
        dashboardErrors,
        `zero app_error on /dashboard allowed; got ${JSON.stringify(dashboardErrors.map((e) => (e.properties as Record<string, unknown>)?.incident_code))}`,
      ).toHaveLength(0);
      const dashboardViews = decoded.filter((e) => {
        if (e.event !== 'page_viewed') return false;
        const p = (e.properties ?? {}) as Record<string, unknown>;
        return String(p.route ?? '').includes('/dashboard');
      });
      expect(dashboardViews.length, 'page_viewed /dashboard must be present on the wire').toBeGreaterThan(0);
      for (const e of decoded) {
        expect(JSON.stringify(e)).not.toContain('@');
      }
      console.log('wire PASS: app_error=0 on /dashboard, page_viewed present, zero PII');
    } finally {
      // ── 7. Read-only zero-diff: this spec must have written NOTHING ──
      const finalRow = await readProfile();
      const diffs = Object.keys(snapshot).filter(
        (col) =>
          !IGNORED_DIFF_COLUMNS.has(col) &&
          JSON.stringify(snapshot[col]) !== JSON.stringify(finalRow[col]),
      );
      expect(
        diffs,
        `hermetic spec must leave the QA profile bit-identical; diffs in ${diffs.join(', ')}`,
      ).toHaveLength(0);
      console.log('zero-diff PASS: QA profile untouched (spec is hermetic, no DB writes)');
    }

    if (browserErrors.length) {
      console.log('browser console errors (informational):', JSON.stringify(browserErrors.slice(0, 5)));
    }
  });
});
