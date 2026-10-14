import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';

/**
 * PB-NOTIFICATIONS-RPC-RELATION-HARDENING-001 (rev.5) — versioned QA matrix for
 * the pb_verify_referral_if_eligible RPC (sql/033) and canonical reward counting.
 *
 * All accounts and fixtures are 100% synthetic. Assertions are about STATUS
 * CHANGES / ERROR CODES, never payloads. Cleans up every fixture it creates.
 *
 * Required env:
 *   QA_REFERRAL_VERIFY=1
 *   QA_SUPABASE_URL / QA_SUPABASE_ANON_KEY / QA_SUPABASE_SERVICE_KEY
 *   QA_COMPANY_EMAIL / QA_COMPANY_PASSWORD   (the referrer)
 */

const QA_REF = 'uqfbilyfpflrlthnyijj';
const TABLE = 'app_14da0f1941_';
const SUPABASE_URL = process.env.QA_SUPABASE_URL ?? `https://${QA_REF}.supabase.co`;
const ANON_KEY = process.env.QA_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.QA_SUPABASE_SERVICE_KEY ?? '';
const COMPANY_EMAIL = process.env.QA_COMPANY_EMAIL ?? '';
const COMPANY_PASSWORD = process.env.QA_COMPANY_PASSWORD ?? '';

let api: APIRequestContext;
let service: APIRequestContext;
let company: { uid: string; token: string };
const createdUserIds: string[] = [];
const createdReferralIds: string[] = [];
const createdNotificationIds: string[] = [];

async function login(email: string, password: string) {
  const res = await api.post('/auth/v1/token?grant_type=password', { data: { email, password } });
  expect(res.status(), `login failed for ${email}`).toBe(200);
  const body = await res.json();
  return { uid: body.user.id as string, token: body.access_token as string };
}

async function createEligibleUser(tag: string) {
  const email = `pb-verify-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@pipingbox-test.example`;
  const password = 'PbVerify!2026x';
  const res = await service.post('/auth/v1/admin/users', { data: { email, password, email_confirm: true } });
  expect(res.status(), 'create eligible user').toBe(200);
  const body = await res.json();
  const uid = body.id as string;
  createdUserIds.push(uid);
  // Full onboarding so the user is eligible (full_name + title).
  const prof = await service.post(`/rest/v1/${TABLE}profiles`, {
    data: { user_id: uid, role: 'worker', account_type: 'worker', full_name: 'Eligible Referred', title: 'Welder' },
    headers: { Prefer: 'return=representation' },
  });
  expect([200, 201], 'create eligible profile').toContain(prof.status());
  return login(email, password);
}

async function createReferral(referrerId: string, referredId: string, status = 'pending') {
  const res = await service.post(`/rest/v1/${TABLE}referrals`, {
    data: { referrer_id: referrerId, referred_id: referredId, status },
    headers: { Prefer: 'return=representation' },
  });
  expect([200, 201], 'create referral').toContain(res.status());
  const [row] = await res.json();
  createdReferralIds.push(row.id);
  return row.id as string;
}

async function rpcVerify(token: string) {
  const res = await api.post('/rest/v1/rpc/pb_verify_referral_if_eligible', {
    data: {},
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

async function referralRow(id: string) {
  const res = await service.get(`/rest/v1/${TABLE}referrals?select=id,status,verified_at&id=eq.${id}`);
  const [row] = await res.json();
  return row as { id: string; status: string; verified_at: string | null };
}

test.describe('PB-NOTIFICATIONS rev.5 — pb_verify_referral_if_eligible + canonical rewards', () => {
  test.skip(!process.env.QA_REFERRAL_VERIFY || !ANON_KEY || !SERVICE_KEY || !COMPANY_EMAIL, 'QA referral verify env not configured');

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: SUPABASE_URL, extraHTTPHeaders: { apikey: ANON_KEY, 'Content-Type': 'application/json' } });
    service = await pwRequest.newContext({ baseURL: SUPABASE_URL, extraHTTPHeaders: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' } });
    company = await login(COMPANY_EMAIL, COMPANY_PASSWORD);
  });

  test.afterAll(async () => {
    for (const id of createdNotificationIds) await service.delete(`/rest/v1/${TABLE}notifications?id=eq.${id}`).catch(() => undefined);
    for (const id of createdReferralIds) await service.delete(`/rest/v1/${TABLE}referrals?id=eq.${id}`).catch(() => undefined);
    for (const id of createdUserIds) {
      await service.delete(`/rest/v1/${TABLE}profiles?user_id=eq.${id}`).catch(() => undefined);
      await service.delete(`/auth/v1/admin/users/${id}`).catch(() => undefined);
    }
    await api.dispose();
    await service.dispose();
  });

  test('N1: direct UPDATE of status/verified_at via PostgREST is denied (RLS)', async () => {
    const referred = await createEligibleUser('n1');
    const rid = await createReferral(company.uid, referred.uid);
    const res = await api.patch(`/rest/v1/${TABLE}referrals?id=eq.${rid}`, {
      data: { status: 'verified', verified_at: new Date().toISOString() },
      headers: { Authorization: `Bearer ${referred.token}`, Prefer: 'return=representation' },
    });
    const row = await referralRow(rid);
    expect([400, 401, 403, 404, 405], 'direct UPDATE must be rejected').toContain(res.status());
    expect(row.status, 'row must remain pending').toBe('pending');
  });

  test('N2: premature verification (no onboarding, no activity) does not change state', async () => {
    // User with email confirmed but EMPTY profile (no full_name/title/skills, no activity).
    const email = `pb-verify-n2-${Date.now()}@pipingbox-test.example`;
    const res = await service.post('/auth/v1/admin/users', { data: { email, password: 'PbVerify!2026x', email_confirm: true } });
    const uid = (await res.json()).id as string;
    createdUserIds.push(uid);
    await service.post(`/rest/v1/${TABLE}profiles`, { data: { user_id: uid, role: 'worker', account_type: 'worker' }, headers: { Prefer: 'return=representation' } });
    const user = await login(email, 'PbVerify!2026x');
    const rid = await createReferral(company.uid, uid);

    const out = await rpcVerify(user.token);
    expect(out.status).toBe(200);
    expect(out.body?.ok).toBe(false);
    expect(['not_eligible', 'no_referral']).toContain(out.body?.reason);
    expect((await referralRow(rid)).status, 'premature verify must not write').toBe('pending');
  });

  test('N3: verify by a user with NO referral returns no_referral and writes nothing', async () => {
    const out = await rpcVerify(company.token);
    expect(out.status).toBe(200);
    expect(out.body?.ok).toBe(false);
    expect(out.body?.reason).toBe('no_referral');
  });

  test('P1: eligible user transitions pending -> verified exactly once with server verified_at', async () => {
    const referred = await createEligibleUser('p1');
    const rid = await createReferral(company.uid, referred.uid);

    const out = await rpcVerify(referred.token);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ok: true, referral_id: rid, referrer_id: company.uid, already_verified: false });

    const row = await referralRow(rid);
    expect(row.status).toBe('verified');
    expect(row.verified_at, 'verified_at set by server').toBeTruthy();
  });

  test('P2: idempotency — second call is already_verified and verified_at unchanged', async () => {
    const referred = await createEligibleUser('p2');
    const rid = await createReferral(company.uid, referred.uid);
    await rpcVerify(referred.token);
    const t1 = (await referralRow(rid)).verified_at;

    const out = await rpcVerify(referred.token);
    expect(out.body?.ok).toBe(true);
    expect(out.body?.already_verified).toBe(true);
    expect((await referralRow(rid)).verified_at, 'verified_at must not change on replay').toBe(t1);
  });

  test('P3: concurrency — 8 parallel calls yield exactly one verified row', async () => {
    const referred = await createEligibleUser('p3');
    const rid = await createReferral(company.uid, referred.uid);
    const results = await Promise.all(Array.from({ length: 8 }, () => rpcVerify(referred.token)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const rows = await service.get(`/rest/v1/${TABLE}referrals?select=id&id=eq.${rid}&status=eq.verified`);
    expect((await rows.json()).length, 'exactly one verified row').toBe(1);
    expect((await referralRow(rid)).status).toBe('verified');
  });

  test('P4: canonical reward counting — only verified/completed count, pending and bare attribution do not', async () => {
    // Distinct referrer so the count is isolated.
    const referrer = await createEligibleUser('ref');
    // 3 verified referrals -> eligible for the first reward tier (target 3).
    for (let i = 0; i < 3; i++) {
      const r = await createEligibleUser(`p4v${i}`);
      await createReferral(referrer.uid, r.uid, 'verified');
    }
    // 3 pending referrals -> must NOT count.
    for (let i = 0; i < 3; i++) {
      const r = await createEligibleUser(`p4p${i}`);
      await createReferral(referrer.uid, r.uid, 'pending');
    }
    // 1 completed referral -> counts.
    const rc = await createEligibleUser('p4c');
    await createReferral(referrer.uid, rc.uid, 'completed');
    // A bare profile attribution WITHOUT any referral row -> must NOT count as verified.
    const bare = await createEligibleUser('p4bare');
    await service.patch(`/rest/v1/${TABLE}profiles?user_id=eq.${bare.uid}`, { data: { referred_by_user_id: referrer.uid } });

    const res = await api.get(`/rest/v1/${TABLE}referrals?select=status&referrer_id=eq.${referrer.uid}&status=in.(verified,completed)`, {
      headers: { Authorization: `Bearer ${referrer.token}` },
    });
    const rows = await res.json();
    expect(res.status()).toBe(200);
    expect(rows.length, 'verified/completed only (3 verified + 1 completed)').toBe(4);

    const pendingRes = await api.get(`/rest/v1/${TABLE}referrals?select=id&referrer_id=eq.${referrer.uid}&status=eq.pending`, {
      headers: { Authorization: `Bearer ${referrer.token}` },
    });
    expect((await pendingRes.json()).length, 'pending tracked separately').toBe(3);
  });
});
