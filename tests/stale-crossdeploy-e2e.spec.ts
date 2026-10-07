import { test, expect, devices } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/**
 * PB-AUTH-CALLBACK-STALE-APP-001 — REAL cross-deploy stale-tab E2E.
 *
 * Unlike tests/auth-callback-e2e.spec.ts (which FAKES the remote
 * /version.json via context.route), this spec observes a REAL deployment
 * happen while an authenticated tab stays open:
 *
 *   1. Login with the QA account on the CURRENT preview deployment.
 *   2. Land on /profile (protected), plant a synthetic draft sentinel.
 *   3. Poll /version.json until the orchestrator's deploy lands
 *      (expected_sha input) — the tab keeps running the OLD bundle.
 *   4. Dispatch focus (NO manual reload): the tab must detect the new
 *      remote version and show the update banner.
 *   5. Click «Actualizar aplicación»: exactly ONE reload, route preserved,
 *      session preserved, draft preserved, running version == deployed.
 *
 * The orchestrator dispatches deploy-preview.yml with the new SHA while
 * this test waits. This job deliberately has NO deploy-preview concurrency
 * group: the preview Worker MUST be allowed to change mid-run.
 */

const BASE = process.env.PREVIEW_URL!;
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EXPECTED_NEW_SHA = process.env.EXPECTED_APP_VERSION ?? '';
const expectedEnv = process.env.EXPECTED_ENV ?? 'preview';
const telemetryAssertable = expectedEnv !== 'production';

test.use({ ...devices['Pixel 7'] });
test.setTimeout(3_300_000); // 55 min — spans a real deploy

if (!BASE || !EMAIL || !PASSWORD) {
  throw new Error('PREVIEW_URL / E2E_TEST_EMAIL / E2E_TEST_PASSWORD are required');
}
if (EXPECTED_NEW_SHA.length !== 40) {
  throw new Error(`EXPECTED_APP_VERSION must be the full 40-char SHA of the deploy this test waits for (got "${EXPECTED_NEW_SHA}")`);
}

test('cross-deploy: live tab detects new deploy, updates once, preserves route/session/draft', async ({ page }) => {
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
  const customPropsOf = (e: Record<string, unknown>): Record<string, unknown> => {
    const props = (e.properties ?? {}) as Record<string, unknown>;
    const custom: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('$')) continue;
      if (k === 'token' || k === 'distinct_id' || k === 'pb_anonymous_id') continue;
      custom[k] = v;
    }
    return custom;
  };
  const waitForWireEvent = async (name: string, timeoutMs = 30_000, min = 1) => {
    const t0 = Date.now();
    for (;;) {
      const found = decodeAll().filter((e) => e.event === name);
      if (found.length >= min) return found;
      if (Date.now() - t0 > timeoutMs) return found;
      await page.waitForTimeout(1500);
    }
  };

  await page.addInitScript(() => {
    try {
      localStorage.setItem('pipingbox_language', 'es');
      localStorage.setItem('pipingbox_beta_dismissed', 'true');
      // Synthetic non-sensitive draft sentinel: must survive the controlled update.
      localStorage.setItem('pb_e2e_draft_sentinel', 'crossdeploy-keep-me');
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

  // --- Login on the CURRENT (pre-deploy) preview bundle -----------------
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  // --- Protected route + pre-deploy version ------------------------------
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
  const oldVersion = await fetchVersion();
  console.log(`[crossdeploy] pre-deploy running version: ${oldVersion ?? '(none)'}`);
  expect(oldVersion).toBeTruthy();
  expect(oldVersion).not.toBe(EXPECTED_NEW_SHA);

  // --- Wait for the REAL deploy to land ----------------------------------
  console.log(`[crossdeploy] waiting for deploy ${EXPECTED_NEW_SHA.slice(0, 7)} (orchestrator dispatches deploy-preview now)`);
  const deadline = Date.now() + 45 * 60_000;
  let newVersion: string | null = null;
  while (Date.now() < deadline) {
    newVersion = await fetchVersion();
    if (newVersion === EXPECTED_NEW_SHA) break;
    // No page interactions here: focus must be dispatched deliberately.
    await page.waitForTimeout(15_000);
  }
  expect(newVersion, 'deploy did not land within 45 minutes').toBe(EXPECTED_NEW_SHA);
  console.log(`[crossdeploy] deploy detected after ${Math.round((45 * 60_000 - (deadline - Date.now())) / 1000)}s`);

  // The tab still runs the OLD bundle: no reload has happened yet.
  await expect(page).toHaveURL(/\/profile/);

  // --- Focus recovery (the Aldo move: pick up the phone again) -----------
  let loads = 0;
  page.on('load', () => {
    loads++;
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // --- The banner must appear from the OLD bundle's detection ------------
  const banner = page.getByTestId('app-update-banner');
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toContainText(/nueva versión|new version/i);
  console.log('[crossdeploy] banner visible after focus');

  if (telemetryAssertable) {
    const detected = await waitForWireEvent('stale_app_version_detected');
    expect(detected.length).toBeGreaterThanOrEqual(1);
    const props = customPropsOf(detected[0]);
    expect(props.target_version).toBe(EXPECTED_NEW_SHA);
    expect(JSON.stringify(props)).not.toMatch(/https?:\/\/|@|\?/);
  }

  // --- User-initiated controlled update ----------------------------------
  await banner.getByRole('button', { name: /actualizar aplicaci|update app/i }).click();

  // Exactly ONE reload; route, session and draft preserved.
  await page.waitForTimeout(9000);
  expect(loads).toBe(1);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page).not.toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem('pb_e2e_draft_sentinel'))).toBe('crossdeploy-keep-me');

  // The tab now runs the deployed version: no more banner, no mismatch.
  await page.waitForTimeout(6000);
  expect(await fetchVersion()).toBe(EXPECTED_NEW_SHA);
  await expect(page.getByTestId('app-update-banner')).toHaveCount(0);

  if (telemetryAssertable) {
    // Exactly one update request (relayed on the post-reload boot).
    const requested = await waitForWireEvent('app_update_requested', 30_000);
    expect(requested.length).toBe(1);
    const props = customPropsOf(requested[0]);
    expect(props.recovery_action).toBe('update_app');
    expect(props.app_version).toBe(EXPECTED_NEW_SHA);
  }

  expect(browserErrors).toEqual([]);
});
