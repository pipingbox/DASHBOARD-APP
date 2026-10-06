import { test, expect, devices } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

/**
 * PB-AUTH-CALLBACK-STALE-APP-001 — auth callback, stale-app detection and
 * invisible-character path E2E (Android Chrome emulation, preview,
 * SHA-locked, disposable QA account).
 *
 * Real incidents (Aldo, Samsung SM-S918B, Chrome Android, 2026-10-06):
 *
 * 1. Google OAuth: Supabase created the session (server-side OK, 302 OK)
 *    but the app stayed on "/auth/callback" with an infinite
 *    "Completando el acceso" spinner — no timeout, no recovery UI.
 * 2. A WhatsApp link "/profile%E2%81%A0" (U+2060 WORD JOINER) rendered the
 *    404 UI.
 * 3. A tab kept running the stale bundle ab34728 for hours after the new
 *    51c3f18 deploy: no version check, no update path, no upload telemetry.
 *
 * Scenarios (GO Fase 7):
 *   A — callback with a valid session and OAuth-shaped params exits
 *       automatically to the allowed destination (no infinite spinner).
 *   B — bare /auth/callback with a valid session exits automatically.
 *   C — stale version: remote /version.json differs → banner on focus →
 *       user-initiated update reloads exactly once, preserves route +
 *       session + storage; persistent mismatch → instructions, no loop.
 *   D — "/profile%E2%81%A0" redirects to "/profile": no 404, no loop.
 *
 * Scenario E (document upload after updating) is covered by the existing
 * SHA-locked tests/document-upload-e2e.spec.ts dispatch.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const expectedEnv = process.env.EXPECTED_ENV ?? 'preview';
// PostHog wire assertions are preview-only by design (production keeps the
// bot filter active; synthetic traffic is dropped client-side there).
const telemetryAssertable = expectedEnv !== 'production';

// Android Chrome emulation — the incident platform.
test.use({ ...devices['Pixel 7'] });

test.describe('PB-AUTH-CALLBACK-STALE-APP-001 (Android Chrome, preview, SHA-locked)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping auth callback E2E');

  const setup = async (page: import('@playwright/test').Page) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_language', 'es');
        localStorage.setItem('pipingbox_beta_dismissed', 'true');
        // Draft-persistence sentinel: must survive every controlled update.
        localStorage.setItem('pb_e2e_draft_sentinel', 'keep-me');
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

    const waitForWireEvent = async (
      name: string,
      timeoutMs = 25_000,
      min = 1,
    ): Promise<Record<string, unknown>[]> => {
      const t0 = Date.now();
      for (;;) {
        const found = decodeAll().filter((e) => e.event === name);
        if (found.length >= min) return found;
        if (Date.now() - t0 > timeoutMs) return found;
        await page.waitForTimeout(500);
      }
    };

    const login = async () => {
      await page.goto('/login', { waitUntil: 'networkidle' });
      await page.waitForTimeout(4000);
      await page.locator('#email').fill(EMAIL!);
      await page.locator('#password').fill(PASSWORD!);
      await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    };

    return { browserErrors, decodeAll, waitForWireEvent, login };
  };

  test('A+B. callback with a valid session exits automatically (OAuth-shaped params and bare)', async ({ page }) => {
    const s = await setup(page);
    await s.login();

    // A — OAuth-shaped callback params (hash-token flow: no `code`; the
    // session already exists and must be found and used).
    await page.goto('/auth/callback?next=%2Fdashboard&lng=es&flow=google', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    // No infinite spinner: the callback screen must not be visible anymore.
    await expect(page.getByText(/completando el acceso/i)).toHaveCount(0);

    // B — bare callback with a live session.
    await page.goto('/auth/callback', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    if (telemetryAssertable) {
      // Poll until BOTH callback completions have flushed to the wire.
      const completed = await s.waitForWireEvent('auth_callback_completed', 25_000, 2);
      expect(completed.length).toBeGreaterThanOrEqual(2);
      for (const evt of completed) {
        const props = (evt.properties ?? {}) as Record<string, unknown>;
        // Closed props only — no URL, no code, no PII on the wire.
        expect(JSON.stringify(props)).not.toMatch(/code=|@evil|access_token/i);
        expect(props.provider).toBe('google');
      }
    }

    // Zero app errors across the whole scenario.
    expect(s.browserErrors).toEqual([]);
  });

  test('C. stale version: banner, single user-initiated reload, route/session/drafts preserved, no loop', async ({ page, context }) => {
    // The focus-recovery step waits out the real 60s check throttle.
    test.setTimeout(210_000);
    const s = await setup(page);
    await s.login();

    // Serve a DIFFERENT remote version from now on (simulates the new
    // deploy existing at the origin while this tab keeps the old bundle).
    // Registered BEFORE the fresh /profile load so the app-start check
    // (3s after mount) already sees the mismatch.
    const remoteVersion = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    await context.route('**/version.json*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify({ version: remoteVersion }),
      });
    });

    // Fresh page lifecycle on a protected route — must be preserved across
    // the controlled update.
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });

    // The banner appears from the app-start version check.
    const banner = page.getByTestId('app-update-banner');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText(/nueva versión|new version/i);

    if (telemetryAssertable) {
      const detected = await s.waitForWireEvent('stale_app_version_detected');
      expect(detected.length).toBeGreaterThanOrEqual(1);
      const props = (detected[0].properties ?? {}) as Record<string, unknown>;
      expect(props.target_version).toBe(remoteVersion);
      expect(JSON.stringify(props)).not.toMatch(/https?:\/\/|@|\?/);
    }

    // "Later" hides the banner…
    await banner.getByRole('button', { name: /más tarde|later/i }).click();
    await expect(page.getByTestId('app-update-banner')).toHaveCount(0);

    // …and focus recovery after the 60s throttle re-checks and re-shows it
    // (an old tab returning to the foreground learns about the update).
    await page.waitForTimeout(62_000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('app-update-banner')).toBeVisible({ timeout: 20_000 });

    // Count page loads: exactly ONE reload after the user action.
    let loads = 0;
    page.on('load', () => {
      loads++;
    });

    await page.getByTestId('app-update-banner').getByRole('button', { name: /actualizar aplicaci|update app/i }).click();

    // After the controlled reload: the SAME route, session intact, draft
    // sentinel intact, and the banner is now in "persistent" mode with
    // manual instructions — NO second reload ever happens.
    await page.waitForTimeout(8000);
    await expect(page).toHaveURL(/\/profile/);
    // Session preserved (still authenticated, no login redirect).
    await expect(page).not.toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('pb_e2e_draft_sentinel'))).toBe('keep-me');

    const persistentBanner = page.getByTestId('app-update-banner');
    await expect(persistentBanner).toBeVisible();
    await expect(persistentBanner).toContainText(/no hemos podido actualizar|couldn't update/i);
    // The update button is GONE — no further reloads possible from the UI.
    await expect(
      persistentBanner.getByRole('button', { name: /actualizar aplicaci|update app/i }),
    ).toHaveCount(0);

    if (telemetryAssertable) {
      const requested = await s.waitForWireEvent('app_update_requested');
      expect(requested.length).toBe(1); // exactly one update request
    }

    // Loop check: wait and assert no additional navigation happened.
    const loadsAfterWait = loads;
    await page.waitForTimeout(6000);
    expect(loads).toBe(loadsAfterWait);

    expect(s.browserErrors).toEqual([]);
  });

  test('D. exact incident: /profile%E2%81%A0 redirects to /profile (no 404, no loop)', async ({ page }) => {
    const s = await setup(page);
    await s.login();

    // The EXACT WhatsApp-delivered URL. Playwright normalizes some percent
    // encodings, so also assert on the decoded literal form.
    await page.goto('/profile%E2%81%A0', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
    // No 404 UI, and the profile surface actually rendered.
    await expect(page.getByText(/404|página no encontrada|page not found/i)).toHaveCount(0);
    await page.waitForTimeout(6000);
    await expect(page).toHaveURL(/\/profile$/);

    if (telemetryAssertable) {
      const normalized = await s.waitForWireEvent('invalid_path_normalized');
      expect(normalized.length).toBeGreaterThanOrEqual(1);
      const props = (normalized[0].properties ?? {}) as Record<string, unknown>;
      // ONLY the clean route is emitted — never the contaminated original.
      expect(props.route_normalized).toBe('/profile');
      expect(JSON.stringify(props)).not.toContain('%E2%81%A0');
      expect(JSON.stringify(props)).not.toContain('\\u2060');
    }

    expect(s.browserErrors).toEqual([]);
  });
});
