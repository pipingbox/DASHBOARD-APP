import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';

/**
 * PB-NOTIFICATION-PROFILE-INCOMPLETE-FIX-001 — live QA matrix for the
 * dedicated pb_create_profile_suggestions() RPC (sql/058).
 *
 * Covers the incident QA requirements:
 *   * valid suggestion is delivered through the new path (self, own profile)
 *   * 30-day per-field cooldown dedups repeat calls
 *   * no PROFILE_INCOMPLETE rows can appear for another user
 *   * unexpected parameters (type/recipient forgery attempts) are rejected
 *   * anon is rejected
 *   * the cross-user RPC boundary is untouched (separate suite)
 *
 * QA identities (E2E_TEST_EMAIL / E2E_TEST_EMAIL_B) are dedicated test
 * accounts. The PROFILE_INCOMPLETE type was never deliverable before this
 * fix, so any such rows on these accounts are artifacts of this suite and
 * are cleaned up via owner DELETE. Profile fields touched by the suite
 * (title/skills/location) are snapshotted and restored.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.E2E_SUPABASE_ANON_KEY ?? '';
const EMAIL_A = process.env.E2E_TEST_EMAIL ?? '';
const PASSWORD_A = process.env.E2E_TEST_PASSWORD ?? '';
const EMAIL_B = process.env.E2E_TEST_EMAIL_B ?? '';
const PASSWORD_B = process.env.E2E_TEST_PASSWORD_B ?? '';
const T = 'app_14da0f1941_notifications';
const PROFILES = 'app_14da0f1941_profiles';
const RPC = 'pb_create_profile_suggestions';
const TYPE = 'PROFILE_INCOMPLETE';

function baseHeaders(): Record<string, string> {
  return { apikey: ANON_KEY, 'Content-Type': 'application/json' };
}
async function rest(token: string | null) {
  const ctx = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  const merge = (opts?: { headers?: Record<string, string>; data?: unknown }) => {
    const headers = { ...baseHeaders(), ...auth, ...(opts?.headers ?? {}) };
    return opts && 'data' in opts ? { ...opts, headers } : { ...opts, headers };
  };
  return {
    get: (url: string, opts?: { headers?: Record<string, string> }) => ctx.get(url, merge(opts)),
    post: (url: string, opts?: { headers?: Record<string, string>; data?: unknown }) =>
      ctx.post(url, merge(opts)),
    patch: (url: string, opts?: { headers?: Record<string, string>; data?: unknown }) =>
      ctx.patch(url, merge(opts)),
    delete: (url: string, opts?: { headers?: Record<string, string> }) => ctx.delete(url, merge(opts)),
    dispose: () => ctx.dispose(),
  };
}
async function login(email: string, password: string): Promise<{ token: string; uid: string }> {
  const ctx = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  const res = await ctx.post('/auth/v1/token?grant_type=password', {
    headers: baseHeaders(),
    data: { email, password },
  });
  const body = await res.json();
  await ctx.dispose();
  expect(body.access_token, `login must succeed for ${email}`).toBeTruthy();
  return { token: body.access_token, uid: body.user.id };
}

test.describe('PB-NOTIFICATION-PROFILE-INCOMPLETE — sql/058 live QA', () => {
  test.skip(!SUPABASE_URL || !ANON_KEY || !EMAIL_A || !EMAIL_B, 'env missing');

  let tokenA = '';
  let tokenB = '';
  let uidA = '';
  let uidB = '';
  let snapshot: { title: string | null; skills: string[] | null; location: string | null } | null = null;
  let api: APIRequestContext;

  test.beforeAll(async () => {
    if (SUPABASE_URL !== 'https://uqfbilyfpflrlthnyijj.supabase.co') {
      throw new Error('QA project identity mismatch; refusing notification test writes');
    }
    ({ token: tokenA, uid: uidA } = await login(EMAIL_A, PASSWORD_A));
    ({ token: tokenB, uid: uidB } = await login(EMAIL_B, PASSWORD_B));
    api = await pwRequest.newContext({ baseURL: SUPABASE_URL });

    // Snapshot A's profile fields touched by this suite.
    const res = await api.get(`/rest/v1/${PROFILES}?select=title,skills,location&user_id=eq.${uidA}`, {
      headers: { ...baseHeaders(), Authorization: `Bearer ${tokenA}` },
    });
    const rows = await res.json();
    snapshot = rows[0] ?? null;
  });

  test.afterAll(async () => {
    // Restore profile fields.
    if (snapshot) {
      const ctx = await rest(tokenA);
      await ctx.patch(`/rest/v1/${PROFILES}?user_id=eq.${uidA}`, { data: snapshot });
      await ctx.dispose();
    }
    // Owner-DELETE every PROFILE_INCOMPLETE row on the QA accounts
    // (all of them are artifacts of this suite — the type was never
    // deliverable before sql/058).
    for (const [tok, uid] of [
      [tokenA, uidA],
      [tokenB, uidB],
    ] as const) {
      const ctx = await rest(tok);
      await ctx.delete(`/rest/v1/${T}?user_id=eq.${uid}&type=eq.${TYPE}`);
      await ctx.dispose();
    }
    await api.dispose();
  });

  test('authenticated call with incomplete profile creates valid suggestions (new path)', async () => {
    const ctx = await rest(tokenA);
    // Clean slate for A (suite artifacts only).
    await ctx.delete(`/rest/v1/${T}?user_id=eq.${uidA}&type=eq.${TYPE}`);

    // Make the canonical profile incomplete on three fields.
    await ctx.patch(`/rest/v1/${PROFILES}?user_id=eq.${uidA}`, {
      data: { title: null, skills: null, location: null },
    });

    const res = await ctx.post(`/rest/v1/rpc/${RPC}`, { data: {} });
    expect(res.status(), `RPC must succeed, got ${res.status()}`).toBe(200);
    const created = await res.json();
    expect(created, 'at least one suggestion must be created').toBeGreaterThanOrEqual(1);
    expect(created).toBeLessThanOrEqual(3);

    const rows = await (
      await ctx.get(
        `/rest/v1/${T}?select=related_entity_id,action_url,type&user_id=eq.${uidA}&type=eq.${TYPE}&order=created_at.asc`,
      )
    ).json();
    expect(rows.length).toBe(created);
    for (const row of rows) {
      expect(row.type).toBe(TYPE);
      expect(row.related_entity_id).toMatch(/^field:(title|skills|location|years_experience|availability_status)$/);
      expect(row.action_url).toBe('/profile');
    }
    await ctx.dispose();
  });

  test('repeat calls never duplicate the same suggestion (30-day per-field cooldown)', async () => {
    const ctx = await rest(tokenA);
    // Call until the RPC stops creating (all gaps suggested). Verified QA
    // semantics: each call creates up to 3 suggestions for gaps that do not
    // have a row newer than 30 days — later calls fill remaining gaps, but
    // a field already suggested within the window is never repeated.
    let last = -1;
    for (let i = 0; i < 4 && last !== 0; i += 1) {
      const res = await ctx.post(`/rest/v1/rpc/${RPC}`, { data: {} });
      expect(res.status()).toBe(200);
      last = await res.json();
      expect(last).toBeLessThanOrEqual(3);
    }
    expect(last, 'a converged call must create nothing').toBe(0);

    const rows = await (
      await ctx.get(`/rest/v1/${T}?select=related_entity_id&user_id=eq.${uidA}&type=eq.${TYPE}`)
    ).json();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const perField = new Map<string, number>();
    for (const row of rows as { related_entity_id: string }[]) {
      perField.set(row.related_entity_id, (perField.get(row.related_entity_id) ?? 0) + 1);
    }
    for (const [field, count] of perField) {
      expect(count, `field ${field} must be suggested exactly once per cooldown window`).toBe(1);
    }
    await ctx.dispose();
  });

  test('distinct fields produce independent suggestions (per-field dedup)', async () => {
    const ctx = await rest(tokenA);
    const rows = await (
      await ctx.get(`/rest/v1/${T}?select=related_entity_id&user_id=eq.${uidA}&type=eq.${TYPE}`)
    ).json();
    const fields = rows.map((r: { related_entity_id: string }) => r.related_entity_id);
    expect(new Set(fields).size, 'each field is an independent suggestion').toBe(fields.length);
    expect(fields.length).toBeGreaterThanOrEqual(1);
    await ctx.dispose();
  });

  test('no PROFILE_INCOMPLETE row can appear for another user', async () => {
    const actx = await rest(tokenA);
    // A calls the RPC (already deduped, but the call must still be safe).
    await actx.post(`/rest/v1/rpc/${RPC}`, { data: {} });
    await actx.dispose();

    const bctx = await rest(tokenB);
    const rowsB = await (
      await bctx.get(`/rest/v1/${T}?select=id&user_id=eq.${uidB}&type=eq.${TYPE}`)
    ).json();
    expect(rowsB.length, 'recipient forgery is impossible: zero args, auth.uid()-derived').toBe(0);
    await bctx.dispose();
  });

  test('unexpected parameters (type/recipient forgery) are rejected', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/rpc/${RPC}`, {
      data: { p_type: 'ADMIN_BROADCAST', p_recipient_id: uidB },
    });
    expect(
      [400, 404].includes(res.status()),
      `forged parameters must be rejected, got ${res.status()}`,
    ).toBe(true);
    await ctx.dispose();
  });

  test('anon call is denied', async () => {
    const ctx = await rest(null);
    const res = await ctx.post(`/rest/v1/rpc/${RPC}`, { data: {} });
    expect([401, 403], `anon RPC must be denied, got ${res.status()}`).toContain(res.status());
    await ctx.dispose();
  });

  test('cross-user boundary untouched: PROFILE_INCOMPLETE still rejected by pb_create_client_notification', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post('/rest/v1/rpc/pb_create_client_notification', {
      data: {
        p_type: 'PROFILE_INCOMPLETE',
        p_title: 'probe',
        p_message: 'probe',
        p_related_entity_type: 'profile',
        p_related_entity_id: 'field:title',
        p_action_url: '/profile',
        p_recipient_id: uidA,
      },
    });
    const body = await res.text();
    expect([400, 403], `cross-user RPC must reject PROFILE_INCOMPLETE, got ${res.status()}`).toContain(
      res.status(),
    );
    expect(body).toContain('not client-creatable');
    await ctx.dispose();
  });
});
