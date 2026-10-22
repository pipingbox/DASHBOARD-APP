import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * PB-AUTH-LOCK-ONBOARDING-STALL-001 — onboarding postpone ("skip") E2E in QA.
 *
 * Production symptom: a real user was PERMANENTLY stuck in the onboarding
 * wizard — "Completar después" never released its spinner, so the onboarding
 * could neither be finished nor skipped.
 *
 * Root causes fixed on this branch (see the DIAGNOSIS doc):
 *   - auth-js notified onAuthStateChange subscribers while holding its
 *     internal lock queue; useAuth's subscriber awaited a PostgREST profile
 *     read whose REST call re-entered getSession() → self-deadlock.
 *   - Every critical await in the wizard (autosave, finalize, postpone,
 *     avatar upload, status reads, refreshProfile) was unbounded.
 *
 * This spec drives the REAL skip path against QA with a synthetic AUTH_ONLY
 * account and asserts:
 *   1. The wizard is reachable for an incomplete profile.
 *   2. "Completar después" resolves within a bounded window (no indefinite
 *      spinner) and navigates to the dashboard.
 *   3. The postponement is REALLY persisted (`onboarding_postponed_at`
 *      verified server-side with the user's own token).
 *   4. After a reload the dashboard remains reachable (postponed < 24 h must
 *      not trap the user again).
 *   5. The wizard can be re-entered from /onboarding (resume path).
 *
 * The canonical "finish onboarding" path requires the complete-onboarding
 * edge function, which is NOT deployed in QA (404): the finish flow is
 * marked BLOCKED in the report instead of being faked here.
 *
 * Credentials come from env and are never committed; without them the file
 * is skipped so pipelines without a provisioned QA account do not fail hard:
 *
 *   E2E_TEST_ONB_EMAIL=...
 *   E2E_TEST_ONB_PASSWORD=...
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 */

const EMAIL = process.env.E2E_TEST_ONB_EMAIL;
const PASSWORD = process.env.E2E_TEST_ONB_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const hasCreds = Boolean(EMAIL && PASSWORD && SUPABASE_URL && SUPABASE_ANON_KEY);

/** Navigation after a successful postpone must resolve well inside this
 * window even in the degraded auth-lock state (~8 s ladder + writes). */
const POSTPONE_BUDGET_MS = 45_000;

async function apiToken(email: string, password: string): Promise<string> {
  const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  try {
    const res = await api.post('/auth/v1/token?grant_type=password', {
      headers: { apikey: SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
      data: { email, password },
    });
    expect(res.status(), 'QA onboarding account must authenticate').toBe(200);
    const body = await res.json();
    return body.access_token as string;
  } finally {
    await api.dispose();
  }
}

test.describe('Onboarding postpone (skip) — PB-AUTH-LOCK-ONBOARDING-STALL-001', () => {
  test.skip(!hasCreds, 'Requires E2E_TEST_ONB_EMAIL / E2E_TEST_ONB_PASSWORD + Supabase QA config');

  test('skip resolves bounded, persists postponement, survives reload, wizard resumes', async ({ page }) => {
    test.setTimeout(180_000);

    await page.addInitScript(() => {
      try {
        localStorage.setItem('pipingbox_beta_dismissed', 'true');
      } catch {
        /* storage unavailable */
      }
    });

    // Login with the synthetic AUTH_ONLY account.
    await page.goto('/login');
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();

    // The onboarding gate must route an incomplete profile into the wizard
    // (either directly or after navigating to /onboarding).
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30_000 });
    if (!page.url().includes('/onboarding')) {
      await page.goto('/onboarding');
    }
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });

    // 1) Wizard reachable; the postpone affordance must be present.
    const skipButton = page.getByRole('button', { name: /complete later|completar después/i });
    await expect(skipButton).toBeVisible({ timeout: 30_000 });

    // 2) Skip must resolve within the budget — the production bug left the
    // spinner spinning forever. Navigation to the dashboard is the proof.
    await skipButton.click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: POSTPONE_BUDGET_MS });

    // 3) Persistence: onboarding_postponed_at must be set server-side.
    const token = await apiToken(EMAIL!, PASSWORD!);
    const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
    try {
      const res = await api.get(
        '/rest/v1/app_14da0f1941_profiles?select=onboarding_status,onboarding_postponed_at',
        { headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` } },
      );
      expect(res.status()).toBe(200);
      const rows = await res.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(1);
      expect(
        rows[0].onboarding_postponed_at,
        'postpone must persist onboarding_postponed_at',
      ).toBeTruthy();
    } finally {
      await api.dispose();
    }

    // 4) Reload: a postponed user (< 24 h) must NOT be trapped again.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole('link', { name: /profile/i }).first()).toBeVisible({ timeout: 30_000 });

    // 5) Resume: /onboarding re-opens the wizard (status not completed).
    await page.goto('/onboarding');
    await expect(
      page.getByRole('button', { name: /complete later|completar después/i }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
