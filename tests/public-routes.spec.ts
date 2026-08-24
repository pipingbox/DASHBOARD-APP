import { test, expect } from '@playwright/test';

/**
 * Public route surface — PB-WEB-005 (F1).
 *
 * Pins the approved public surface of app.pipingbox.com so it cannot drift in either
 * direction without a test failing:
 *
 *  - Closing a public route again silently breaks the acquisition funnel. MASTER_ROADMAP
 *    treats the tools as the #1 acquisition channel, so gating them behind login is a
 *    business regression, not just a UX one.
 *  - Opening MORE routes than approved is worse: /jobs and /companies stay protected until
 *    PB-ADMIN-ONBOARDING-SCHEMA-001 is verified in production, because until then every
 *    worker scores 0 in matching and a visitor would meet an empty marketplace.
 *
 * Runs without credentials on purpose: this is guest-facing behaviour.
 */

const PUBLIC_ROUTES = ['/tools', '/academy', '/companies/request-workers'];
const STILL_PROTECTED_ROUTES = ['/jobs', '/companies'];

test.describe('PB-WEB-005 public surface', () => {
  for (const path of PUBLIC_ROUTES) {
    test(`${path} is reachable without a session`, async ({ page }) => {
      await page.goto(path);
      await expect(page, `${path} must not bounce to /login`).not.toHaveURL(/\/login/, {
        timeout: 10_000,
      });
    });
  }

  for (const path of STILL_PROTECTED_ROUTES) {
    test(`${path} is still protected`, async ({ page }) => {
      await page.goto(path);
      await expect(page, `${path} must redirect to /login`).toHaveURL(/\/login/, {
        timeout: 10_000,
      });
    });
  }

  test('guest shell does not imply a session', async ({ page }) => {
    // A visitor on a public route must not be shown Sign out or a role badge: it implies
    // an account that does not exist and every workspace link would bounce to /login.
    await page.goto('/tools');
    await expect(page.getByRole('link', { name: /sign in|log in/i }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: /sign out/i })).toHaveCount(0);
  });
});
