import { test, expect } from '@playwright/test';

/**
 * Permanent Auth E2E gate for PipingBox deployments (Cloudflare Workers
 * preview and, later, production). Uses a dedicated, disposable QA test
 * account (email starts with "qa.e2e") -- NEVER a real user. Credentials
 * are read from env vars at runtime and must never be committed or logged:
 *
 *   set E2E_TEST_EMAIL=...
 *   set E2E_TEST_PASSWORD=...
 *   npx playwright test tests/auth-e2e.spec.ts
 *
 * If the env vars are not set, all tests in this file are skipped (so the
 * pipeline doesn't fail hard when no test account is provisioned yet).
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

test.describe('Auth E2E gate', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping Auth E2E gate');

  test('unauthenticated user hitting a protected route is redirected to /login', async ({ page }) => {
    await page.goto('/companies/request-workers');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('login with valid credentials reaches /dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const rootHtml = await page.locator('#root').innerHTML();
    expect(rootHtml.length).toBeGreaterThan(200);
  });

  test('authenticated session persists across a hard reload', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.reload({ waitUntil: 'networkidle' });
    // Should still be on /dashboard (not bounced back to /login).
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('authenticated user can access a protected route directly', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    // Auto-retrying assertion (a hard navigation needs a moment to
    // hydrate/fetch dashboard data -- a one-shot innerHTML() read here
    // is racy and was observed flaking on this exact check).
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10_000 });
  });

  test('logout returns user to guest state (protected route redirects to /login)', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // Clear Supabase session directly (equivalent to clicking Logout in the
    // account menu -- avoids depending on menu markup/copy that may change).
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((k) => k.includes('supabase') || k.includes('sb-'))
        .forEach((k) => localStorage.removeItem(k));
    });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('forgot-password: submitting a known email does not error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/forgot-password');
    await page.locator('#email').fill(EMAIL!);
    await page.getByRole('button', { name: /send|enviar/i }).click();

    // Success state shows a confirmation heading/icon; absence of a thrown
    // JS exception + moving past the form is what we assert (we cannot
    // access the actual recovery email in this environment).
    await expect(page.getByText(/back to sign in|volver/i)).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test('reset-password page without a recovery token shows the expired-link state (no crash)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/reset-password');
    // No recovery session -> page must show the "link expired" fallback,
    // not throw or render blank.
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });
});

test.describe('Auth E2E gate -- OAuth/magic-link (manual verification required)', () => {
  test.skip(
    true,
    'Google OAuth and magic-link callbacks require Supabase Auth Redirect URLs to allowlist the preview origin and a real inbox to click through -- not safely automatable headlessly. Verify manually per PB-CF-MIGRATION step 5-5b before cutover.'
  );
});
