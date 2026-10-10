import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * PB-NOTIFICATIONS-INSERT-HARDENING-001 — security contract for
 * app_14da0f1941_notifications after sql/027.
 *
 * Contract:
 *   * Direct REST INSERT: self-only (policy authenticated_insert_own_notifications,
 *     WITH CHECK auth.uid() = user_id). Cross-user direct INSERT → 403.
 *   * pb_create_client_notification RPC (SECURITY DEFINER, narrow):
 *       - benign client types only: like/comment/job_invitation/
 *         REFERRAL_JOINED/REFERRAL_VERIFIED
 *       - actor derived from auth.uid() (cannot be forged)
 *       - referral types require an existing referrals row
 *         (referrer_id=recipient, referred_id=actor)
 *       - privileged/server types (ADMIN_*, JOB_MATCH, PROFILE_*, …) rejected
 *       - self notifications rejected
 *       - anon rejected (auth.uid() IS NULL + EXECUTE revoked)
 *
 * QA identities (E2E_TEST_EMAIL / E2E_TEST_EMAIL_B) must be unrelated users
 * with no referrals row between them. Probes are rejection-only or insert
 * low-privilege rows that are cleaned up via owner DELETE in the same test.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.E2E_SUPABASE_ANON_KEY ?? '';
const EMAIL_A = process.env.E2E_TEST_EMAIL ?? '';
const PASSWORD_A = process.env.E2E_TEST_PASSWORD ?? '';
const EMAIL_B = process.env.E2E_TEST_EMAIL_B ?? '';
const PASSWORD_B = process.env.E2E_TEST_PASSWORD_B ?? '';
const T = 'app_14da0f1941_notifications';
const RPC = 'pb_create_client_notification';
const PROBE_TITLE = 'NH-HARDENING-CLEANUP';

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
    delete: (url: string, opts?: { headers?: Record<string, string> }) =>
      ctx.delete(url, merge(opts)),
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
function rpcPayload(type: string, recipientId: string) {
  return {
    p_type: type,
    p_title: PROBE_TITLE,
    p_message: 'hardening probe',
    p_related_entity_type: 'gate',
    p_related_entity_id: 'probe',
    p_action_url: '/dashboard',
    p_recipient_id: recipientId,
  };
}

test.describe('PB-NOTIFICATIONS — sql/027 + sql/029 security matrix', () => {
  test.skip(!SUPABASE_URL || !ANON_KEY || !EMAIL_A || !EMAIL_B, 'env missing');

  let tokenA = '';
  let tokenB = '';
  let uidA = '';
  let uidB = '';

  test.beforeAll(async () => {
    if (SUPABASE_URL !== 'https://uqfbilyfpflrlthnyijj.supabase.co') {
      throw new Error('QA project identity mismatch; refusing notification test writes');
    }
    ({ token: tokenA, uid: uidA } = await login(EMAIL_A, PASSWORD_A));
    ({ token: tokenB, uid: uidB } = await login(EMAIL_B, PASSWORD_B));
  });

  test.afterAll(async () => {
    // cleanup any probe rows that might have been inserted (owner DELETE)
    for (const [tok, uid] of [
      [tokenA, uidA],
      [tokenB, uidB],
    ] as const) {
      const ctx = await rest(tok);
      await ctx.delete(`/rest/v1/${T}?user_id=eq.${uid}&title=eq.${PROBE_TITLE}`);
      await ctx.dispose();
    }
  });

  // ── Direct REST INSERT ──────────────────────────────────────────────

  test('direct REST INSERT self → 201 (self-only policy)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/${T}`, {
      data: {
        user_id: uidA, type: 'like', title: PROBE_TITLE, message: 'probe',
        related_entity_type: 'gate', related_entity_id: 'probe', action_url: '/dashboard', is_read: false,
      },
    });
    expect(res.status(), `self direct INSERT must be 201, got ${res.status()}`).toBe(201);
    await ctx.delete(`/rest/v1/${T}?user_id=eq.${uidA}&title=eq.${PROBE_TITLE}`);
    await ctx.dispose();
  });

  test('direct REST INSERT cross-user → 403 (arbitrary recipient denied)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/${T}`, {
      data: {
        user_id: uidB, type: 'like', title: PROBE_TITLE, message: 'probe',
        related_entity_type: 'gate', related_entity_id: 'probe', action_url: '/dashboard', is_read: false,
      },
    });
    expect([401, 403], `cross-user direct INSERT must be denied, got ${res.status()}`).toContain(
      res.status(),
    );
    await ctx.dispose();
  });

  test('direct REST INSERT with privileged type self → 201 (type is not filtered at table level; RPC is the privileged gate)', async () => {
    // Table-level policy cannot express a type allowlist; privileged types are
    // blocked by the RPC (tested below). Direct self INSERT remains possible
    // but createNotification never self-notifies and no privileged server type
    // can be created cross-user. This test documents the table-level reality.
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/${T}`, {
      data: {
        user_id: uidA, type: 'ADMIN_BROADCAST', title: PROBE_TITLE, message: 'probe',
        related_entity_type: 'gate', related_entity_id: 'probe', action_url: '/dashboard', is_read: false,
      },
    });
    // Self INSERT of any type is allowed at table level; this is by design
    // (self rows are low-risk and the RPC blocks cross-user privileged types).
    expect(res.status(), `self privileged-type direct INSERT is allowed at table level, got ${res.status()}`).toBe(201);
    await ctx.delete(`/rest/v1/${T}?user_id=eq.${uidA}&title=eq.${PROBE_TITLE}`);
    await ctx.dispose();
  });

  test('anon direct REST INSERT → denied', async () => {
    const ctx = await rest(null);
    const res = await ctx.post(`/rest/v1/${T}`, {
      data: {
        user_id: uidB, type: 'like', title: PROBE_TITLE, message: 'probe',
        related_entity_type: 'gate', related_entity_id: 'probe', action_url: '/dashboard', is_read: false,
      },
    });
    expect([401, 403], `anon INSERT must be denied, got ${res.status()}`).toContain(res.status());
    await ctx.dispose();
  });

  // ── RPC pb_create_client_notification ───────────────────────────────

  test('RPC like without a real source is rejected', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/rpc/${RPC}`, { data: rpcPayload('like', uidB) });
    expect([400, 403]).toContain(res.status());
    await ctx.dispose();
  });

  test('RPC job_invitation without a real source is rejected', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/rpc/${RPC}`, { data: rpcPayload('job_invitation', uidB) });
    expect([400, 403]).toContain(res.status());
    await ctx.dispose();
  });

  test('RPC privileged type (ADMIN_BROADCAST) → error (not client-creatable)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/rpc/${RPC}`, { data: rpcPayload('ADMIN_BROADCAST', uidB) });
    const body = await res.text();
    expect([400, 403], `privileged type must be rejected, got ${res.status()}`).toContain(res.status());
    expect(body, 'error must mention the type is not client-creatable').toContain('not client-creatable');
    await ctx.dispose();
  });

  test('RPC REFERRAL_JOINED without referral row → error (relationship required)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/rpc/${RPC}`, { data: rpcPayload('REFERRAL_JOINED', uidB) });
    const body = await res.text();
    expect([400, 403], `referral type without relationship must be rejected, got ${res.status()}`).toContain(res.status());
    expect(body, 'error must mention the missing referral relationship').toContain('referral relationship');
    await ctx.dispose();
  });

  test('RPC self notification → error (self notifications not allowed)', async () => {
    const ctx = await rest(tokenA);
    const res = await ctx.post(`/rest/v1/rpc/${RPC}`, { data: rpcPayload('like', uidA) });
    const body = await res.text();
    expect([400, 403], `self RPC must be rejected, got ${res.status()}`).toContain(res.status());
    expect(body, 'error must mention self notifications').toContain('self notifications');
    await ctx.dispose();
  });

  test('anon RPC → denied (auth.uid() null / EXECUTE revoked)', async () => {
    const ctx = await rest(null);
    const res = await ctx.post(`/rest/v1/rpc/${RPC}`, { data: rpcPayload('like', uidB) });
    expect([401, 403], `anon RPC must be denied, got ${res.status()}`).toContain(res.status());
    await ctx.dispose();
  });

  test('RPC without a real source creates no third-party notification', async () => {
    const actx = await rest(tokenA);
    const before = await actx.post(`/rest/v1/rpc/${RPC}`, { data: rpcPayload('like', uidB) });
    expect([400, 403]).toContain(before.status());
    await actx.dispose();

    const bctx = await rest(tokenB);
    const readB = await bctx.get(`/rest/v1/${T}?select=id&user_id=eq.${uidB}&title=eq.${PROBE_TITLE}`);
    expect((await readB.json()).length, 'recipient must have no forged notification').toBe(0);
    await bctx.dispose();
  });
});
