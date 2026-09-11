import { test, expect } from '@playwright/test';

/**
 * PB-OBSERVABILITY-001 — anonymous → authenticated identity E2E (preview).
 *
 * Verifies, against the deployed preview, that:
 *  1. an anonymous session emits the referral funnel with an anonymous
 *     distinct_id;
 *  2. login with the dedicated disposable QA account (E2E_TEST_EMAIL, email
 *     starts with "qa.e2e" — NEVER a real user) triggers posthog.identify
 *     with the canonical Supabase auth.user.id (a UUID, never the email);
 *  3. post-auth events carry the UUID distinct_id and the anonymous history
 *     stays linked (PostHog $identify merges both into one person);
 *  4. logout executes resetObservabilityUser() so shared devices never mix
 *     users.
 *
 * Identity values are only ever logged REDACTED (first 8 chars). Credentials
 * come from env and are never printed.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCreds = Boolean(EMAIL && PASSWORD);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const redact = (v: unknown) => (typeof v === 'string' && v.length > 8 ? `${v.slice(0, 8)}…` : v);

test.describe('PB-OBSERVABILITY-001 identity E2E (anonymous → authenticated)', () => {
  test.skip(!hasCreds, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set -- skipping identity E2E');

  test('anonymous funnel → identify(auth.user.id) → post-auth events → logout reset', async ({
    page,
  }) => {
    const captureRequests: { url: string; body: string }[] = [];
    await page.route('**/posthog.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && /\/(e|capture|batch|engage)/.test(req.url())) {
        captureRequests.push({ url: req.url(), body: req.postData() ?? '' });
      }
      await route.continue();
    });

    // ── 1. Anonymous referral journey ──────────────────────────────────────
    await page.goto('/?ref=PB-IDENTITY-E2E', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const anonDistinctId = await page.evaluate(() => {
      // posthog-js persists the anonymous distinct_id in localStorage under a
      // key that contains the project token; read it without printing the key.
      for (const key of Object.keys(localStorage)) {
        if (key.includes('posthog') && key.startsWith('phc_')) {
          try {
            const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
            if (typeof raw.distinct_id === 'string') return raw.distinct_id as string;
          } catch {
            /* ignore */
          }
        }
      }
      return null;
    });
    expect(anonDistinctId, 'anonymous distinct_id must exist before auth').toBeTruthy();
    expect(anonDistinctId).not.toContain('@');
    console.log(`anonymous distinct_id (redacted): ${redact(anonDistinctId)}`);

    // ── 2. Login with the disposable QA account ────────────────────────────
    await page.goto('/login');
    await page.locator('#email').fill(EMAIL!);
    await page.locator('#password').fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in|iniciar sesi/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    await page.waitForTimeout(4000); // allow identify + post-auth events to flush

    // ── 3. Identify assertions on the wire ─────────────────────────────────
    const decoded = captureRequests.flatMap(({ body }) => {
      try {
        const json = JSON.parse(body);
        return (json.batch ?? [json]) as Record<string, unknown>[];
      } catch {
        return [];
      }
    });

    const identifyEvents = decoded.filter((e) => e.event === '$identify');
    expect(identifyEvents.length, 'exactly one $identify must be sent').toBe(1);
    const identifiedId = String(
      (identifyEvents[0].properties as Record<string, unknown>)?.$identified_id ??
        (identifyEvents[0] as Record<string, unknown>).distinct_id ??
        '',
    );
    expect(identifiedId, 'identified id must be the canonical UUID').toMatch(UUID_RE);
    expect(identifiedId).not.toContain('@');
    console.log(`identified auth.user.id (redacted): ${redact(identifiedId)}`);

    // $anon_distinct_id must link the anonymous history to the same person
    const anonLinked = String(
      (identifyEvents[0].properties as Record<string, unknown>)?.$anon_distinct_id ?? '',
    );
    expect(anonLinked).toBe(anonDistinctId);

    // Post-auth events must use the UUID distinct_id, never the email
    const postAuthEvents = decoded.filter(
      (e) =>
        e.event !== '$identify' &&
        typeof (e.properties as Record<string, unknown>)?.distinct_id === 'string' &&
        ((e.properties as Record<string, unknown>).distinct_id as string) === identifiedId,
    );
    expect(postAuthEvents.length, 'post-auth events must carry the UUID distinct_id').toBeGreaterThan(0);
    for (const e of postAuthEvents) {
      const serialized = JSON.stringify(e.properties);
      expect(serialized).not.toContain('@');
      expect(serialized).not.toContain('ref=');
      expect(serialized).not.toContain('PB-IDENTITY-E2E');
    }
    console.log(
      `post-auth events with UUID distinct_id: ${postAuthEvents.map((e) => e.event).join(', ')}`,
    );

    // ── 4. Logout → reset ──────────────────────────────────────────────────
    // The AppShell sign-out button is inside a collapsible sidebar that may be
    // hidden at some viewports; click it via DOM to stay markup-robust.
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((x) => /sign out|log ?out|cerrar sesi/i.test(x.textContent ?? ''));
      b?.click();
    });
    await expect(page).toHaveURL(/\/(login|$)/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    const afterLogoutDistinctId = await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.includes('posthog') && key.startsWith('phc_')) {
          try {
            const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
            if (typeof raw.distinct_id === 'string') return raw.distinct_id as string;
          } catch {
            /* ignore */
          }
        }
      }
      return null;
    });
    // After reset the SDK rotates back to an anonymous id (not the user UUID).
    expect(afterLogoutDistinctId).not.toBe(identifiedId);
    console.log(`post-logout distinct_id (redacted): ${redact(afterLogoutDistinctId)}`);
  });
});
