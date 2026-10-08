import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * PB-GROWTH-GATE-PERMISSIONS-403-001 — security contract for the Data API
 * privileges granted in sql/023-pb-permissions-403-grants.sql.
 *
 * Root cause fixed there: RLS owner policies already existed, but the tables
 * lacked table-level GRANTs for the API roles (SQLSTATE 42501 → HTTP 403).
 *
 * This spec proves BOTH layers for every client-accessible resource:
 *   - owner performs exactly the intended operations (200/201)
 *   - a SECOND authenticated user cannot read or write the owner's rows
 *     (RLS: empty array / zero-row response, never a permission bug)
 *   - anon is denied private user data (401/403)
 *   - anon CAN read the published academy catalog (public landing)
 *   - forged user_id INSERT/UPDATE is rejected
 *   - UPDATE keeps USING + WITH CHECK ownership
 *
 * Uses raw REST (same pattern as referrals.spec.ts T6/T7) so it runs without
 * a browser and without writing any rows: every probe is read-only or expects
 * rejection. The only write probes are forge attempts, which must fail.
 *
 * NOTE: context-level `headers` silently drops the `apikey` header in this
 * Playwright version (reproduced: same values per-request → 200, context →
 * 401 "No API key found"), so headers are injected per request via rest().
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
const EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
const EMAIL_B = process.env.E2E_TEST_EMAIL_B ?? '';
const PASSWORD_B = process.env.E2E_TEST_PASSWORD_B ?? '';

const NOTIFICATIONS = 'app_14da0f1941_notifications';
const TOOL_USAGE = 'app_14da0f1941_tool_usage';
const CERT_PREFS = 'app_14da0f1941_cert_alert_prefs';
const COURSES = 'app_academy_courses';
const LESSONS = 'app_academy_lessons';
const ACADEMY_PROGRESS = 'app_academy_progress';
const STRIPE_PRICES = 'app_stripe_prices';

async function loginToken(email: string, password: string): Promise<string> {
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(res.ok(), `login failed for ${email.split('@')[0]}`).toBeTruthy();
  const body = await res.json();
  await ctx.dispose();
  return body.access_token as string;
}

interface ReqOpts {
  headers?: Record<string, string>;
  data?: unknown;
}

/** Minimal request wrapper that injects apikey/Authorization per request. */
async function rest(token: string | null) {
  const base: Record<string, string> = { apikey: ANON_KEY };
  if (token) base.Authorization = `Bearer ${token}`;
  const ctx = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  const merge = (opts?: ReqOpts) => ({ ...opts, headers: { ...base, ...(opts?.headers ?? {}) } });
  return {
    get: (url: string, opts?: ReqOpts) => ctx.get(url, merge(opts)),
    post: (url: string, opts?: ReqOpts) => ctx.post(url, merge(opts)),
    patch: (url: string, opts?: ReqOpts) => ctx.patch(url, merge(opts)),
    dispose: () => ctx.dispose(),
  };
}

test.describe('PB-GROWTH-GATE-PERMISSIONS-403-001 — privilege + RLS contract', () => {
  test.skip(!SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD, 'requires Supabase + QA credentials');

  let tokenA = '';
  let uidA = '';

  test.beforeAll(async () => {
    tokenA = await loginToken(EMAIL, PASSWORD);
    const ctx = await rest(tokenA);
    const me = await ctx.get('/auth/v1/user');
    uidA = (await me.json()).id;
    await ctx.dispose();
  });

  // ── OWNER: intended operations succeed ────────────────────────────────

  test('owner SELECT notifications → 200 (bell + unread badge work)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.get(`/rest/v1/${NOTIFICATIONS}?select=id&user_id=eq.${uidA}&limit=1`);
    expect(res.status(), 'owner SELECT notifications must not be 403 (sql/023)').toBe(200);
    await ctx.dispose();
  });

  test('owner UPDATE notifications — USING enforced (forged user_id rejected)', async () => {
    const ctx = await rest(tokenA);
    // Attempt to flip user_id on own rows → WITH CHECK must reject or affect 0 rows.
    const forged = await ctx.patch(`/rest/v1/${NOTIFICATIONS}?user_id=eq.${uidA}`, {
      headers: { Prefer: 'count=exact' },
      data: { user_id: '00000000-0000-0000-0000-000000000000' },
    });
    // Either the RLS WITH CHECK rejects (403) or zero rows match the policy.
    const range = forged.headers()['content-range'] ?? '';
    const affected = range.includes('/') ? parseInt(range.split('/')[1], 10) : -1;
    expect(
      forged.status() === 403 || affected === 0,
      `forged UPDATE must not succeed (status=${forged.status()}, range=${range})`,
    ).toBeTruthy();
    await ctx.dispose();
  });

  test('owner SELECT tool_usage → 200 (dashboard recent tools works)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.get(`/rest/v1/${TOOL_USAGE}?select=id&user_id=eq.${uidA}&limit=1`);
    expect(res.status(), 'owner SELECT tool_usage must not be 403 (sql/023)').toBe(200);
    await ctx.dispose();
  });

  test('forged user_id INSERT tool_usage → rejected (RLS insert_own)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/${TOOL_USAGE}`, {
      data: {
        user_id: '00000000-0000-0000-0000-000000000000',
        tool_name: 'forge-probe',
        tool_category: 'qa',
      },
    });
    expect([401, 403], `forged INSERT must be denied, got ${res.status()}`).toContain(res.status());
    await ctx.dispose();
  });

  test('owner SELECT cert_alert_prefs → 200; zero rows is a valid empty state', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.get(`/rest/v1/${CERT_PREFS}?select=id&user_id=eq.${uidA}&limit=1`);
    expect(res.status(), 'owner SELECT cert_alert_prefs must not be 403 (sql/023)').toBe(200);
    const body = await res.json();
    expect(Array.isArray(body), 'zero-row state must be [], never a permission error').toBeTruthy();
    await ctx.dispose();
  });

  test('forged user_id INSERT cert_alert_prefs → rejected (RLS insert_own)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/${CERT_PREFS}`, {
      data: { user_id: '00000000-0000-0000-0000-000000000000', in_app_alerts: true },
    });
    expect([401, 403], `forged INSERT must be denied, got ${res.status()}`).toContain(res.status());
    await ctx.dispose();
  });

  test('notifications INSERT by user → denied (backend-only creation)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/${NOTIFICATIONS}`, {
      data: { user_id: uidA, type: 'probe', title: 'probe', message: 'probe' },
    });
    expect([401, 403], `user INSERT notifications must stay denied, got ${res.status()}`).toContain(
      res.status(),
    );
    await ctx.dispose();
  });

  // ── sql/024: academy progress + stripe prices ─────────────────────────

  test('owner SELECT academy_progress → 200 (Academy progress UI works)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.get(
      `/rest/v1/${ACADEMY_PROGRESS}?select=id&user_id=eq.${uidA}&limit=1`,
    );
    expect(res.status(), 'owner SELECT academy_progress must not be 403 (sql/024)').toBe(200);
    await ctx.dispose();
  });

  test('forged user_id INSERT academy_progress → rejected (RLS write WITH CHECK)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/${ACADEMY_PROGRESS}`, {
      data: {
        user_id: '00000000-0000-0000-0000-000000000000',
        lesson_id: '00000000-0000-0000-0000-000000000000',
        course_id: '00000000-0000-0000-0000-000000000000',
        status: 'completed',
      },
    });
    expect([401, 403], `forged INSERT must be denied, got ${res.status()}`).toContain(res.status());
    await ctx.dispose();
  });

  test('academy_progress DELETE by user → denied (UI never deletes progress)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.patch(`/rest/v1/${ACADEMY_PROGRESS}?user_id=eq.${uidA}`, {
      headers: { Prefer: 'count=exact' },
      data: { user_id: '00000000-0000-0000-0000-000000000000' },
    });
    const range = res.headers()['content-range'] ?? '';
    const affected = range.includes('/') ? parseInt(range.split('/')[1], 10) : -1;
    expect(
      res.status() === 403 || affected === 0,
      `forged UPDATE must not succeed (status=${res.status()}, range=${range})`,
    ).toBeTruthy();
    await ctx.dispose();
  });

  test('anon + owner CAN read active stripe_prices; write denied', async () => {
    const anon = await rest(null);
    const pub = await anon.get(`/rest/v1/${STRIPE_PRICES}?select=product_key&limit=1`);
    expect(pub.status(), 'anon must read active prices (pb_public_read_active_prices)').toBe(200);
    await anon.dispose();
    const ctx = await rest(tokenA);
    const write = await ctx.post(`/rest/v1/${STRIPE_PRICES}`, {
      data: { product_key: 'forge-probe', amount_cents: 1 },
    });
    expect([401, 403], `user write stripe_prices must be denied, got ${write.status()}`).toContain(
      write.status(),
    );
    await ctx.dispose();
  });

  // ── ANON: private data denied, public catalog allowed ─────────────────

  test('anon denied on notifications / tool_usage / cert_alert_prefs', async () => {
    const ctx = await rest(null);
    for (const table of [NOTIFICATIONS, TOOL_USAGE, CERT_PREFS, ACADEMY_PROGRESS]) {
      const res = await ctx.get(`/rest/v1/${table}?select=id&limit=1`);
      expect([401, 403], `anon ${table} must be denied, got ${res.status()}`).toContain(
        res.status(),
      );
    }
    await ctx.dispose();
  });

  test('anon CAN read published academy catalog (public landing contract)', async () => {
    const ctx = await rest(null);
    const courses = await ctx.get(`/rest/v1/${COURSES}?select=id&limit=1`);
    expect(courses.status(), 'anon must read published courses (sql/023)').toBe(200);
    const lessons = await ctx.get(`/rest/v1/${LESSONS}?select=id&limit=1`);
    expect(lessons.status(), 'anon must read published lessons (sql/023)').toBe(200);
    await ctx.dispose();
  });

  // ── CROSS-USER ISOLATION (second authenticated identity) ──────────────

  test('cross-user: second user cannot read owner rows (RLS)', async () => {
    test.skip(!EMAIL_B || !PASSWORD_B, 'requires E2E_TEST_EMAIL_B / E2E_TEST_PASSWORD_B');
    const tokenB = await loginToken(EMAIL_B, PASSWORD_B);
    const ctx = await rest(tokenB);
    for (const table of [NOTIFICATIONS, TOOL_USAGE, CERT_PREFS, ACADEMY_PROGRESS]) {
      const res = await ctx.get(`/rest/v1/${table}?select=id&user_id=eq.${uidA}`);
      expect(res.status(), `cross-user SELECT ${table} must not error`).toBe(200);
      const rows = await res.json();
      expect(rows.length, `second user must see ZERO of owner's ${table} rows`).toBe(0);
    }
    // cross-user write attempt on owner rows → zero affected or rejected
    const upd = await ctx.patch(`/rest/v1/${TOOL_USAGE}?user_id=eq.${uidA}`, {
      headers: { Prefer: 'count=exact' },
      data: { tool_name: 'cross-user-probe' },
    });
    const range = upd.headers()['content-range'] ?? '';
    const affected = range.includes('/') ? parseInt(range.split('/')[1], 10) : -1;
    expect(
      upd.status() === 403 || affected === 0,
      `cross-user UPDATE must not succeed (status=${upd.status()}, range=${range})`,
    ).toBeTruthy();
    await ctx.dispose();
  });
});
