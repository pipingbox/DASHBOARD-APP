import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Permanent Academy premium-access gate (PB-MARKET-ACCESS-001).
 *
 * Verifies the entitlement chain end to end on a deployed preview. Note the
 * routing reality: /academy/course/:slug and /academy/lesson/:lessonId are
 * auth-wrapped (withShellRoles), so "anonymous -> blocked" manifests as a
 * redirect to /login. The entitlement gate itself is what blocks AUTHENTICATED
 * users without a paid order (the original leak: `!user` was the only check).
 *
 *   anonymous            -> redirected to /login (course page + direct URL)
 *   authenticated unpaid -> premium lesson shows the blocked screen
 *   paid order           -> premium lesson allowed
 *   free preview         -> allowed for an authenticated unpaid user
 *
 * Env vars (all optional; scenarios skip cleanly when missing):
 *   PREVIEW_URL                     - base URL (playwright.config.ts)
 *   E2E_SUPABASE_URL                - Supabase project URL (read-only anon)
 *   E2E_SUPABASE_ANON_KEY           - anon key (public course/lesson reads)
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD - disposable QA account (qa.e2e*)
 *   E2E_SUPABASE_SERVICE_ROLE_KEY   - REQUIRED only for the paid scenario
 *                                     (app_orders has no INSERT policy for
 *                                     authenticated users by design).
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const SB_URL = process.env.E2E_SUPABASE_URL;
const SB_ANON = process.env.E2E_SUPABASE_ANON_KEY;
const SB_SERVICE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

const hasDb = Boolean(SB_URL && SB_ANON);
const hasCreds = Boolean(EMAIL && PASSWORD);
const hasService = Boolean(SB_SERVICE);

const BLOCKED_HEADING = 'Premium Course';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(EMAIL!);
  await page.locator('#password').fill(PASSWORD!);
  await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe('Academy premium access gate (PB-MARKET-ACCESS-001)', () => {
  test.skip(!hasDb, 'E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY not set -- skipping Academy access gate');

  let anon: SupabaseClient;
  let premiumCourse: { id: string; slug: string };
  let premiumLesson: { id: string };
  let freePreviewLesson: { id: string } | null;

  test.beforeAll(async () => {
    anon = createClient(SB_URL!, SB_ANON!);
    const { data: course } = await anon
      .from('app_academy_courses')
      .select('id, slug')
      .eq('is_premium', true)
      .limit(1)
      .single();
    expect(course, 'expected at least one premium course (is_premium=true)').toBeTruthy();
    premiumCourse = course;

    const { data: locked } = await anon
      .from('app_academy_lessons')
      .select('id')
      .eq('course_id', premiumCourse.id)
      .eq('is_free_preview', false)
      .order('order_index')
      .limit(1);
    premiumLesson = locked![0];
    expect(premiumLesson, 'expected at least one non-preview lesson in the premium course').toBeTruthy();

    const { data: preview } = await anon
      .from('app_academy_lessons')
      .select('id')
      .eq('course_id', premiumCourse.id)
      .eq('is_free_preview', true)
      .limit(1);
    freePreviewLesson = preview?.[0] ?? null;
  });

  test('anonymous: course page redirects to /login (route-level auth)', async ({ page }) => {
    await page.goto(`/academy/course/${premiumCourse.slug}`);
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('anonymous: direct premium lesson URL redirects to /login (route-level auth)', async ({ page }) => {
    await page.goto(`/academy/lesson/${premiumLesson.id}`);
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('authenticated unpaid: direct premium lesson URL shows the blocked screen', async ({ page }) => {
    test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set');
    await login(page);
    await page.goto(`/academy/lesson/${premiumLesson.id}`);
    await expect(page.getByRole('heading', { name: BLOCKED_HEADING })).toBeVisible({ timeout: 15_000 });
  });

  test('authenticated unpaid: premium lesson is locked in the course list', async ({ page }) => {
    test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set');
    await login(page);
    await page.goto(`/academy/course/${premiumCourse.slug}`);
    // Every rendered lesson link must point to a free-preview lesson or be a
    // disabled "#" placeholder -- never to a premium (non-preview) lesson.
    const lessonLinks = page.locator('a[href^="/academy/lesson/"]');
    const count = await lessonLinks.count();
    for (let i = 0; i < count; i++) {
      const href = await lessonLinks.nth(i).getAttribute('href');
      expect(href).not.toContain(premiumLesson.id);
    }
  });

  test('free preview lesson is accessible without a paid order', async ({ page }) => {
    test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set');
    test.skip(!freePreviewLesson, 'no is_free_preview lesson seeded in the premium course');
    await login(page);
    await page.goto(`/academy/lesson/${freePreviewLesson!.id}`);
    await expect(
      page.getByRole('heading', { name: BLOCKED_HEADING })
    ).not.toBeVisible({ timeout: 15_000 });
  });

  test('paid order grants access to the premium lesson', async ({ page }) => {
    test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set');
    test.skip(!hasService, 'E2E_SUPABASE_SERVICE_ROLE_KEY not set (app_orders INSERT requires service role)');

    // Resolve the QA user id via a Node-side Supabase session (same pattern
    // as secure-file-access-broker.spec.ts) -- no localStorage parsing.
    const userClient = createClient(SB_URL!, SB_ANON!);
    const { data: auth, error: authError } = await userClient.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });
    expect(authError, `QA login failed: ${authError?.message}`).toBeFalsy();
    const userId = auth.session?.user?.id;
    expect(userId, 'could not resolve QA user id').toBeTruthy();
    await userClient.auth.signOut();

    const service = createClient(SB_URL!, SB_SERVICE!);

    // Ensure the QA user has NO pre-existing paid order for the course.
    await service
      .from('app_orders')
      .delete()
      .eq('user_id', userId)
      .eq('product_key', 'vca_course_bvca');

    // Blocked first (unpaid baseline for THIS user).
    await login(page);
    await page.goto(`/academy/lesson/${premiumLesson.id}`);
    await expect(page.getByRole('heading', { name: BLOCKED_HEADING })).toBeVisible({ timeout: 15_000 });

    // Insert a paid order as the canonical entitlement source, then reload.
    const { error } = await service.from('app_orders').insert({
      user_id: userId,
      product_key: 'vca_course_bvca',
      status: 'paid',
      amount_cents: 5990,
      currency: 'eur',
    });
    expect(error, `failed to seed paid order: ${error?.message}`).toBeFalsy();

    try {
      await page.goto(`/academy/lesson/${premiumLesson.id}`);
      await expect(
        page.getByRole('heading', { name: BLOCKED_HEADING })
      ).not.toBeVisible({ timeout: 15_000 });
      // The lesson screen renders the course breadcrumb, not the blocked box.
      await expect(page.locator('#root')).not.toBeEmpty();
    } finally {
      await service
        .from('app_orders')
        .delete()
        .eq('user_id', userId)
        .eq('product_key', 'vca_course_bvca');
    }
  });
});
