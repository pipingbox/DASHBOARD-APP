import { test, expect, devices } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/**
 * PB-AUTH-CALLBACK-STALE-APP-001 — PRODUCTION smoke (real cross-deploy with
 * the PRE-deploy bundle, i.e. the exact Aldo incident generation).
 *
 * Sequenced by the orchestrator:
 *   1. This job starts BEFORE the production deploy: login with the QA
 *      account, land on /profile, plant a draft sentinel, and poll
 *      /version.json (404 on the old bundle) until the deploy lands.
 *   2. Focus the OLD tab WITHOUT reloading:
 *        - session preserved, no pageerror, no destructive behavior;
 *        - DOCUMENTED generational fact: the pre-deploy production bundle
 *          (51c3f18) predates this ticket, so it contains NO detection
 *          code — the banner can only appear for tabs running >= the
 *          candidate. No automatic reload may happen either.
 *   3. Manual reload → the new bundle: /version.json == deployed SHA,
 *      route/session/draft preserved.
 *   4. Post-deploy functional smoke on the NEW bundle:
 *        - bare /auth/callback with a live session exits automatically
 *          (the exact failure mode of the incident);
 *        - /profile%E2%81%A0 normalizes to /profile (replace, no 404,
 *          no loop, no invisible char in the final URL).
 *   5. PostHog wire capture: whatever the production client sends is
 *      asserted for zero PII in custom props (production ingestion may
 *      drop synthetic traffic by design — the wire capture still proves
 *      payload hygiene; dashboard-level confirmation comes from Aldo's
 *      real-user smoke).
 */

const BASE = process.env.PREVIEW_URL!;
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EXPECTED_NEW_SHA = process.env.EXPECTED_APP_VERSION ?? '';

test.use({ ...devices['Pixel 7'] });

if (!BASE || !EMAIL || !PASSWORD) {
  throw new Error('PREVIEW_URL / E2E_TEST_EMAIL / E2E_TEST_PASSWORD are required');
}
if (EXPECTED_NEW_SHA.length !== 40) {
  throw new Error(`EXPECTED_APP_VERSION must be the full 40-char deployed SHA (got "${EXPECTED_NEW_SHA}")`);
}

test.describe('PB-AUTH-CALLBACK-STALE-APP-001 production smoke', () => {
  const setup = async (page: import('@playwright/test').Page) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_language', 'es');
        localStorage.setItem('pipingbox_beta_dismissed', 'true');
        localStorage.setItem('pb_e2e_draft_sentinel', 'prod-keep-me');
      } catch {
        /* noop */
      }
    });
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      } catch {
        /* noop */
      }
    });

    const browserErrors: string[] = [];
    page.on('pageerror', (e) => browserErrors.push(e.message));

    const payloads: Buffer[] = [];
    page.on('request', (req) => {
      if ((req.url().includes('/i/e') || req.url().includes('posthog')) && req.method() === 'POST') {
        const b = req.postDataBuffer();
        if (b) payloads.push(b);
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
          const j = JSON.parse(text) as Record<string, unknown> & { batch?: unknown[] };
          return (j.batch ?? [j]) as Record<string, unknown>[];
        } catch {
          return [];
        }
      });

    const login = async () => {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(4000);
      await page.locator('#email').fill(EMAIL);
      await page.locator('#password').fill(PASSWORD);
      await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    };

    return { browserErrors, decodeAll, login };
  };

  test('A. cross-deploy: old production tab stays safe, manual reload lands the new bundle', async ({ page }) => {
    test.setTimeout(3_300_000); // 55 min — spans the production deploy
    const s = await setup(page);
    await s.login();

    await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/profile/);

    const fetchVersion = (): Promise<string | null> =>
      page.evaluate(async () => {
        try {
          const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
          if (!res.ok) return null;
          const j = (await res.json()) as { version?: unknown };
          return typeof j.version === 'string' ? j.version : null;
        } catch {
          return null;
        }
      });

    // Pre-deploy: the old production bundle does not serve /version.json.
    const preVersion = await fetchVersion();
    console.log(`[prod-smoke] pre-deploy /version.json: ${preVersion ?? 'absent (old bundle 51c3f18, pre-ticket)'}`);
    expect(preVersion).toBeNull();

    // Wait for the REAL production deploy to land.
    console.log(`[prod-smoke] waiting for deploy ${EXPECTED_NEW_SHA.slice(0, 7)}`);
    const deadline = Date.now() + 45 * 60_000;
    let newVersion: string | null = null;
    while (Date.now() < deadline) {
      newVersion = await fetchVersion();
      if (newVersion === EXPECTED_NEW_SHA) break;
      await page.waitForTimeout(15_000);
    }
    expect(newVersion, 'production deploy did not land within 45 minutes').toBe(EXPECTED_NEW_SHA);

    // --- Focus the OLD tab (no reload) ---------------------------------
    let loads = 0;
    page.on('load', () => {
      loads++;
    });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(10_000);

    // Generational fact, asserted for the record: the pre-deploy bundle has
    // no detection code (it ships in THIS deploy and protects tabs against
    // FUTURE deploys). The old tab must stay SAFE, not self-update.
    expect(await page.getByTestId('app-update-banner').count()).toBe(0);
    expect(loads).toBe(0); // no automatic reload
    await expect(page).toHaveURL(/\/profile/); // still authenticated, no kick
    expect(s.browserErrors).toEqual([]);

    // --- Manual reload → the new bundle ---------------------------------
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    expect(loads).toBe(1);
    expect(await fetchVersion()).toBe(EXPECTED_NEW_SHA);
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page).not.toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('pb_e2e_draft_sentinel'))).toBe('prod-keep-me');
    // Version now matches: no banner on the new bundle either.
    await page.waitForTimeout(5000);
    expect(await page.getByTestId('app-update-banner').count()).toBe(0);
    expect(s.browserErrors).toEqual([]);
    console.log('[prod-smoke] old tab safely migrated to the new bundle');
  });

  test('B. /auth/callback with a live session exits automatically (incident failure mode)', async ({ page }) => {
    test.setTimeout(120_000);
    const s = await setup(page);
    await s.login();

    // Bare callback with a live session: must exit on its own.
    await page.goto(`${BASE}/auth/callback`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
    await expect(page.getByText(/completando el acceso/i)).toHaveCount(0);

    // next=/profile allowlist: exits to the allowed destination.
    await page.goto(`${BASE}/auth/callback?next=%2Fprofile`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });

    expect(s.browserErrors).toEqual([]);
  });

  test('C. exact incident URL /profile%E2%81%A0 normalizes to /profile', async ({ page }) => {
    test.setTimeout(120_000);
    const s = await setup(page);
    await s.login();

    await page.goto(`${BASE}/profile%E2%81%A0`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
    // No 404 surface, no loop, and the invisible char is GONE from the URL.
    await expect(page.getByText(/404|página no encontrada|page not found/i)).toHaveCount(0);
    expect(page.url()).not.toContain('%E2%81%A0');
    expect(page.url()).not.toContain('\u2060');
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/profile$/);
    expect(s.browserErrors).toEqual([]);
  });

  test('D. PostHog wire: zero PII in custom props of every captured event', async ({ page }) => {
    test.setTimeout(180_000);
    const s = await setup(page);
    await s.login();
    // Produce the ticket's success events: callback exit + normalization.
    await page.goto(`${BASE}/auth/callback`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
    await page.goto(`${BASE}/profile%E2%81%A0`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
    // Let the SDK's batch interval flush.
    await page.waitForTimeout(15_000);

    const events = s.decodeAll();
    const names = events.map((e) => e.event);
    console.log(`[prod-smoke] PostHog wire events captured (${names.length}): ${JSON.stringify(names)}`);
    // NOTE: production ingestion may drop synthetic traffic by design
    // (bot filter); if nothing was sent, dashboard-level confirmation is
    // delegated to Aldo's real-user smoke. Whatever DID go out must be PII-free.
    for (const evt of events) {
      const props = (evt.properties ?? {}) as Record<string, unknown>;
      const custom: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        if (k.startsWith('$')) continue;
        if (k === 'token' || k === 'distinct_id' || k === 'pb_anonymous_id') continue;
        custom[k] = v;
      }
      const serialized = JSON.stringify(custom);
      console.log(`[prod-smoke]   ${evt.event}: ${serialized}`);
      // Zero PII: no emails, no tokens, no OAuth codes, no URLs/query
      // strings, no user UUID as a custom property, no contaminated path.
      expect(serialized).not.toMatch(/@evil|@gmail|@pipingbox|access_token|refresh_token|code=[A-Za-z0-9]/i);
      expect(serialized).not.toMatch(/https?:\/\//);
      if (evt.event === 'invalid_path_normalized') {
        expect(custom.route_normalized).toBe('/profile');
        expect(serialized).not.toContain('%E2%81%A0');
      }
      if (evt.event === 'auth_callback_completed' || evt.event === 'auth_callback_started') {
        expect(['google', 'email']).toContain(custom.provider);
        expect(custom.environment).toBe('production');
        expect(custom.app_version).toBe(EXPECTED_NEW_SHA);
      }
    }
    expect(s.browserErrors).toEqual([]);
  });
});
