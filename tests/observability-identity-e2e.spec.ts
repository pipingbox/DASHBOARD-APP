import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

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
    // Capture the raw PostHog wire traffic (gzip-compressed batches).
    const payloads: Buffer[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('posthog.com') && req.method() === 'POST') {
        const buf = req.postDataBuffer();
        if (buf) payloads.push(buf);
      }
    });
    // Preview diagnostic: the before_send hook logs each event it receives.
    const diagLogs: string[] = [];
    page.on('console', (m) => {
      if (m.text().includes('[pb-obs-diag]')) diagLogs.push(m.text());
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
          const json = JSON.parse(text) as Record<string, unknown> & { batch?: unknown[] };
          return (json.batch ?? [json]) as Record<string, unknown>[];
        } catch {
          return [];
        }
      });

    // ── 1. Anonymous referral journey ──────────────────────────────────────
    await page.goto('/?ref=PB-IDENTITY-E2E', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const anonDistinctId = await page.evaluate(() => {
      // The canonical anonymous id of the observability layer (device-level,
      // technical UUID) — NOT the posthog-js persistence key, which is
      // token-scoped and must never be printed.
      return localStorage.getItem('pb_obs_anon_id');
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
    const decoded = decodeAll();
    console.log(`posthog events decoded: ${decoded.length} (${[...new Set(decoded.map((e) => e.event))].join(', ')})`);

    const identifyEvents = decoded.filter((e) => e.event === '$identify');
    expect(identifyEvents.length, 'exactly one $identify must be sent').toBe(1);
    const identifyProps = (identifyEvents[0].properties ?? {}) as Record<string, unknown>;
    const identifiedId = String(
      identifyProps.$identified_id ?? identifyProps.distinct_id ?? identifyEvents[0].distinct_id ?? '',
    );
    expect(identifiedId, 'identified id must be the canonical UUID').toMatch(UUID_RE);
    expect(identifiedId).not.toContain('@');
    console.log(`identified auth.user.id (redacted): ${redact(identifiedId)}`);

    // The anonymous history must be linked into the same person.
    const anonLinked = String(identifyProps.$anon_distinct_id ?? '');
    expect(anonLinked.length, '$identify must carry $anon_distinct_id').toBeGreaterThan(0);

    // Post-auth events must use the UUID distinct_id, never the email.
    // NOTE: the app dedupes page_viewed per route per session, so /dashboard
    // may not re-emit if the anonymous journey already visited it. Navigate to
    // a fresh authenticated route to guarantee a post-auth event.
    await page.goto('/jobs');
    await page.waitForTimeout(2500);
    // The canonical post-auth distinct_id is the SDK's current distinct_id,
    // which identify() rotated to the auth.user.id. Read it from the app.
    const sdkDistinctId = await page.evaluate(async () => {
      const mod = await import('/src/lib/observability.ts').catch(() => null);
      return mod && typeof mod.getDistinctId === 'function' ? mod.getDistinctId() : null;
    });
    const decodedAfterNav = decodeAll();
    const postAuthEvents = decodedAfterNav.filter(
      (e) =>
        e.event !== '$identify' &&
        typeof (e.properties as Record<string, unknown>)?.distinct_id === 'string' &&
        ((e.properties as Record<string, unknown>).distinct_id as string) === identifiedId,
    );
    if (postAuthEvents.length === 0) {
      console.log(`decoded after /jobs nav: ${decodedAfterNav.length} events; diag: ${diagLogs.join(' | ') || '(none)'}`);
      console.log(`all distinct_ids seen: ${[...new Set(decodedAfterNav.map((e) => String((e.properties as Record<string, unknown>)?.distinct_id ?? '?')))].map((d) => redact(d)).join(', ')}`);
      console.log(`identifiedId redacted: ${redact(identifiedId)}; sdkDistinctId redacted: ${redact(sdkDistinctId)}`);
      for (const e of decodedAfterNav) {
        const p = (e.properties ?? {}) as Record<string, unknown>;
        console.log(`evt=${String(e.event)} distinct_id=${redact(String(p.distinct_id ?? '?'))} isUUID=${UUID_RE.test(String(p.distinct_id ?? ''))}`);
      }
    }
    expect(
      postAuthEvents.length,
      'post-auth events must carry the UUID distinct_id',
    ).toBeGreaterThan(0);
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
      // After resetObservabilityUser() the posthog-js persistence rotates back
      // to an anonymous distinct_id. Read it without printing the token-scoped
      // storage key.
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
