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
  '/',
  '/tools',
  '/academy',
  '/companies/request-workers',
  '/jobs',
  '/companies',
  '/dsa',
  '/privacy',
  '/terms',
  '/contact',
  '/certifications',
  '/certifications/vca',
  '/certifications/scc',
  '/certifications/prl',
  '/blog/',
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

test.describe('PB-SEO-102 Worker route contract', () => {
  test('valid public deep links stay reachable', async ({ page }) => {
    for (const path of ['/', '/tools', '/jobs', '/companies', '/certifications/vca']) {
      await page.goto(path);
      await expect(page, `${path} must not be a Worker 404`).not.toHaveURL(/404|not-found/, {
        timeout: 10_000,
      });
      await expect(page.locator('body')).not.toContainText('Not found', { timeout: 5000 });
    }
  });

  test('valid auth/protected deep links are not edge-404ed', async ({ page }) => {
    // Worker must not return 404 for valid app routes; auth enforcement is client-side.
    for (const path of ['/dashboard', '/profile', '/applications', '/messages', '/company/jobs', '/company/settings', '/admin']) {
      await page.goto(path);
      await expect(page, `${path} must receive the SPA shell, not 404`).not.toHaveURL(/404|not-found/, {
        timeout: 10_000,
      });
    }
  });

  test('valid dynamic shapes receive the SPA shell', async ({ page }) => {
    for (const path of ['/blog/asme-b31-3-vs-b31-1/', '/academy/module/1', '/academy/module/22']) {
      await page.goto(path);
      await expect(page, `${path} must be a valid dynamic route`).not.toHaveURL(/404|not-found/, {
        timeout: 10_000,
      });
    }
  });

  test('unknown routes return HTTP 404 from the Worker', async ({ request }) => {
    for (const path of ['/this-route-definitely-does-not-exist', '/tools/does-not-exist', '/company/does-not-exist', '/academy/999', '/academy/not-a-real-route', '/random/deep/path']) {
      const response = await request.get(path);
      expect(response.status(), `${path} must be 404`).toBe(404);
    }
  });

  test('unknown HTML document returns 404 + SPA shell for branded NotFound UI', async ({ page, request }) => {
    const response = await page.goto('/this-route-does-not-exist');
    expect(response?.status(), 'direct unknown HTML navigation must be HTTP 404').toBe(404);
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: /home/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /tools/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /jobs/i })).toBeVisible();

    // The response body must be the SPA shell (so React can boot), not a plain text 404.
    // The Worker only serves the SPA shell for HTML-document requests, so the
    // API request must explicitly send Accept: text/html (Playwright's
    // APIRequestContext does NOT send it by default, unlike page.goto above).
    const reqResponse = await request.get('/this-route-does-not-exist', {
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    expect(reqResponse.status(), 'unknown HTML document must be HTTP 404').toBe(404);
    const body = await reqResponse.text();
    expect(body).toContain('id="root"');
  });

  test('missing static asset returns 404 and no SPA shell', async ({ request }) => {
    const response = await request.get('/assets/definitely-missing-file.js');
    expect(response.status()).toBe(404);
    const body = await response.text();
    expect(body).not.toContain('id="root"');
  });

  test('unknown route + query string remains 404', async ({ request }) => {
    const response = await request.get('/no-such-route?source=test');
    expect(response.status()).toBe(404);
  });

  test('valid route + query string remains valid', async ({ request }) => {
    const response = await request.get('/tools?source=test');
    expect(response.status()).toBe(200);
  });

  test('HEAD reflects GET status for valid and invalid routes', async ({ request }) => {
    const valid = await request.head('/tools');
    expect(valid.status()).toBe(200);
    const invalid = await request.head('/no-such-route');
    expect(invalid.status()).toBe(404);
  });
});

test.describe('PB-SEO-102 useSeo noindex lifecycle', () => {
  test('noindex is set on NotFound and removed after navigating away', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible({ timeout: 10_000 });

    const robotsBefore = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robotsBefore).toContain('noindex');

    await page.getByRole('link', { name: /tools/i }).click();
    // PB-WEB-007: the app's canonical production origin is the apex
    // (https://pipingbox.com). app.pipingbox.com is a permanent 301 alias, so
    // when this gate runs against the app host the Worker redirects to the
    // apex and the assertion must accept the canonical URL there. Asserting
    // the literal path '/tools' against the app alias host would require the
    // redirect to be reverted, contradicting the canonical-host decision.
    await expect(page).toHaveURL(/\/tools\/?$/, { timeout: 10_000 });

    const robotsAfter = await page.locator('meta[name="robots"]').count();
    expect(robotsAfter).toBe(0);
  });
});

test.describe('PB-SEO-102 NotFound UI', () => {
  test('unknown client-side route renders NotFound page', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: /home/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /tools/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /jobs/i })).toBeVisible();
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

  // PB-OBSERVABILITY-PROD-ROLLOUT-001 regression: vite-plugin-sitemap
  // normalized every URL to the slash-less form, so blog entries advertised
  // their non-canonical 307-redirecting variants. The plugin was replaced by
  // explicit generation (app/frontend/prerender/sitemap.js). This test pins
  // the single canonical policy so router, sitemap and canonical links
  // cannot drift apart again:
  //   - '/' and blog routes (prerendered directories): trailing slash;
  //   - every other app route: no trailing slash;
  //   - no duplicate <loc> entries, canonical hostname only.
  test('sitemap enforces the canonical trailing-slash policy', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(locs.length, 'sitemap must not be empty').toBeGreaterThan(0);
    expect(
      new Set(locs).size,
      'sitemap must not contain duplicate URLs',
    ).toBe(locs.length);

    for (const loc of locs) {
      expect(loc, `canonical hostname only: ${loc}`).toMatch(
        /^https:\/\/pipingbox\.com(\/|$)/,
      );
    }

    const blogLocs = locs.filter((loc) => loc.includes('/blog'));
    expect(blogLocs, 'sitemap must cover the blog index').toContain(
      'https://pipingbox.com/blog/',
    );
    for (const loc of blogLocs) {
      expect(loc, `blog URLs keep their trailing slash: ${loc}`).toMatch(/\/$/);
      expect(
        locs,
        `non-canonical slash-less variant must not coexist: ${loc}`,
      ).not.toContain(loc.replace(/\/$/, ''));
    }

    const appLocs = locs.filter(
      (loc) => loc !== 'https://pipingbox.com/' && !loc.includes('/blog'),
    );
    expect(appLocs.length, 'sitemap must cover app routes').toBeGreaterThan(0);
    for (const loc of appLocs) {
      expect(
        loc,
        `app routes never carry a trailing slash: ${loc}`,
      ).not.toMatch(/\/$/);
    }
  });
});

test.describe('PB-SEO-103 tool landing pages', () => {
  // Prerendered, indexable acquisition pages for REAL tools only
  // (src/lib/tool-landings.ts is the single registry consumed by router,
  // SPA_ROUTE_CONTRACT, prerender and sitemap).
  const TOOL_LANDING_SLUGS = [
    'flange-dimensions',
    'stud-bolts',
    'pipe-dimensions',
    'elbow-cut',
    'branch-layout',
  ];

  test('every tool landing serves prerendered crawlable HTML at /tools/<slug>', async ({
    request,
  }) => {
    for (const slug of TOOL_LANDING_SLUGS) {
      // maxRedirects: 0 pins the no-redirect contract: the canonical URL
      // (no trailing slash) must be served directly, not via a 301/307.
      const response = await request.get(`/tools/${slug}`, { maxRedirects: 0 });
      expect(response.status(), `/tools/${slug} must be a direct 200`).toBe(200);

      const body = await response.text();
      // Prerendered content, not the empty SPA shell: H1 and intro copy are
      // present in the server-delivered HTML.
      expect(body, `/tools/${slug} must contain an <h1>`).toMatch(/<h1[^>]*>/);
      expect(
        body,
        `/tools/${slug} must ship real copy, not a thin placeholder`,
      ).toContain('ASME');
      // Exactly one canonical link pointing at the canonical host + slug.
      const canonicals = body.match(/<link rel="canonical" href="[^"]+"/g) ?? [];
      expect(
        canonicals.length,
        `/tools/${slug} must have exactly one canonical`,
      ).toBe(1);
      expect(
        canonicals[0],
        `/tools/${slug} canonical must be the apex URL without trailing slash`,
      ).toBe(`<link rel="canonical" href="https://pipingbox.com/tools/${slug}"`);
      // Unique metadata per PO SEO output requirements.
      expect(body).toMatch(/<meta name="description" content="[^"]+"/);
      // Public acquisition page: must never carry noindex.
      expect(body).not.toMatch(/<meta name="robots"[^>]*noindex/);
    }
  });

  test('unknown tool slug stays a Worker 404 (no soft-200 landing)', async ({
    request,
  }) => {
    // /tools/does-not-exist is structurally valid as /tools/:slug, but the
    // slug is not in the registry, so the Worker must reject it before the
    // SPA shell is served. This pins the registry as the single truth: a
    // removed tool landing cannot linger as an indexable 200.
    const response = await request.get('/tools/does-not-exist');
    expect(response.status()).toBe(404);
    const body = await response.text();
    expect(body).not.toContain('id="root"');
  });

  test('tool landing renders in-app with resolved i18n and catalog deep link', async ({
    page,
  }) => {
    await page.goto('/tools/stud-bolts');

    // The "Beta Version" modal renders as an aria-modal dialog which makes the
    // rest of the page aria-hidden; dismiss it first (same as PB-WEB-005).
    const continueButton = page.getByRole('button', { name: /continue/i });
    if (await continueButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await continueButton.click();
    }

    await expect(
      page.getByRole('heading', {
        name: /Stud Bolt and Nut Calculator/i,
      }),
      'landing must render its H1',
    ).toBeVisible({ timeout: 10_000 });

    // No unresolved i18n keys may leak into the rendered page.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/tools\.landing\./);

    // The interactive catalog deep link (/tools?t=<toolKey>) must be offered.
    await expect(page.locator('a[href="/tools?t=bolts-nuts"]')).toBeVisible();

    // Related landing links keep crawlable internal linking between pages.
    await expect(page.locator('a[href="/tools/flange-dimensions"]')).toBeVisible();
  });

  test('sitemap includes the five tool landing URLs', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    for (const slug of TOOL_LANDING_SLUGS) {
      expect(
        body,
        `sitemap must include https://pipingbox.com/tools/${slug}`,
      ).toContain(`https://pipingbox.com/tools/${slug}`);
    }
  });
});
