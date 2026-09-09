import { test, expect } from '@playwright/test';

/**
 * Public route surface — PB-WEB-005 (F1 + F2).
 *
 * Pins the approved public surface of app.pipingbox.com so it cannot drift in either
 * direction without a test failing:
 *
 *  - Closing a public route again silently breaks the acquisition funnel. MASTER_ROADMAP
 *    treats the tools as the #1 acquisition channel, so gating them behind login is a
 *    business regression, not just a UX one.
 *  - Opening MORE routes than approved exposes things before they are ready; any new public
 *    route must be a conscious decision, not a refactor side effect.
 *
 * Runs without credentials on purpose: this is guest-facing behaviour.
 *
 * F1 (2026-08-24): /tools, /academy, /companies/request-workers
 * F2 (2026-08-25): /jobs, /companies — unblocked after PB-ADMIN-ONBOARDING-SCHEMA-001
 *                  confirmed in production: 12 profiles repaired, marketplace_ready correct,
 *                  recalculate-profiles v9 ACTIVE (consent-aware).
 * PB-MARKET-PROD-001 §7.2 (block 0.1): /dsa — DSA arts. 11 and 12 contact points.
 */

const PUBLIC_ROUTES = [
  '/tools',
  '/academy',
  '/companies/request-workers',
  '/jobs',        // F2 — marketplace public; apply() handles !user gracefully
  '/companies',   // F2 — marketing/metrics page, no auth dependency
  // PB-MARKET-PROD-001 §7.2 — legal obligation, not an acquisition choice: DSA arts. 11
  // and 12 require the contact points to be "easily accessible" to authorities and to
  // recipients of the service. Gating them behind login would itself be the
  // non-compliance. Static page, no auth dependency, like /terms and /privacy.
  '/dsa',
];

test.describe('PB-WEB-005 public surface', () => {
  for (const path of PUBLIC_ROUTES) {
    test(`${path} is reachable without a session`, async ({ page }) => {
      await page.goto(path);
      await expect(page, `${path} must not bounce to /login`).not.toHaveURL(/\/login/, {
        timeout: 10_000,
      });
    });
  }

  test('guest shell does not imply a session', async ({ page }) => {
    // A visitor on a public route must not be shown Sign out or a role badge: it implies
    // an account that does not exist and every workspace link would bounce to /login.
    await page.goto('/tools');

    // The "Beta Version" modal renders as an aria-modal dialog, which makes the rest of the
    // page aria-hidden. Role-based queries then find nothing, so dismiss it first — this is
    // also what a real visitor does.
    const continueButton = page.getByRole('button', { name: /continue/i });
    if (await continueButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await continueButton.click();
    }

    // Query by href rather than by role: immune to any remaining overlay side effects.
    await expect(
      page.locator('a[href="/login"]').first(),
      'guest must be offered a way to sign in',
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole('button', { name: /sign out/i }),
      'guest must never be shown Sign out',
    ).toHaveCount(0);
  });
});

test.describe('PB-SEO-101 acquisition foundation', () => {
  test('/.well-known/assetlinks.json serves JSON, not the SPA shell', async ({
    request,
  }) => {
    // TWA (PB-GROWTH-GOOGLE-ACQUISITION-001): Digital Asset Links must return
    // application/json. Until the file existed, the SPA fallback served
    // index.html with text/html, which breaks Android app-link verification.
    const response = await request.get('/.well-known/assetlinks.json');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('blog post renders real content instead of the not-found view', async ({
    page,
  }) => {
    // The blog content lived at the repo root while every consumer expected it
    // under app/frontend/seo/content, so production rendered the empty index
    // and the per-post 404 view. This pins one known post.
    await page.goto('/blog/asme-b31-3-vs-b31-1/');
    await expect(
      page.getByRole('heading', { name: /ASME B31\.3 vs B31\.1/i }).first(),
      'blog post must render its real title',
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/page not found/i)).toHaveCount(0);
  });

  test('sitemap covers legal, certification and blog-post URLs', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    for (const url of [
      'https://pipingbox.com/contact',
      'https://pipingbox.com/privacy',
      'https://pipingbox.com/certifications/vca',
      'https://pipingbox.com/blog/asme-b31-3-vs-b31-1/',
    ]) {
      expect(body, `sitemap must include ${url}`).toContain(url);
    }
  });
});
