import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const QA_REF = 'uqfbilyfpflrlthnyijj';
const TABLE = 'app_14da0f1941_';
const title = `RPC-RELATION-QA-${randomUUID()}`;
const ids: Record<string, string> = {};
const attempted: { source: string; actor: string; recipient: string; type: string }[] = [];
let api: APIRequestContext;
let service: APIRequestContext;
let company: { uid: string; token: string };
let worker: { uid: string; token: string };
let third: { uid: string; token: string };

async function call(ctx: APIRequestContext, path: string, data: unknown, token?: string) {
  return ctx.post(path, { data, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
}

async function create(table: string, data: unknown) {
  const response = await service.post(`/rest/v1/${TABLE}${table}`, {
    data,
    headers: { Prefer: 'return=representation' },
  });
  expect(response.status(), `QA fixture ${table} must insert`).toBe(201);
  return (await response.json())[0].id as string;
}

async function login(email: string, password: string) {
  const response = await call(api, '/auth/v1/token?grant_type=password', { email, password });
  expect(response.status(), 'QA account login').toBe(200);
  const body = await response.json();
  return { uid: body.user.id as string, token: body.access_token as string };
}

function payload(type: string, source: string, kind: string, recipient: string) {
  return {
    p_type: type, p_title: title, p_message: 'untrusted',
    p_related_entity_type: kind, p_related_entity_id: source,
    p_action_url: '/untrusted', p_recipient_id: recipient,
  };
}

async function currentState() {
  const people = [company.uid, worker.uid, third.uid].join(',');
  const result: Record<string, unknown> = {};
  for (const [name, clause] of [
    ['notifications', `user_id=in.(${people})`],
    ['community_posts', `id=in.(${ids.post},${ids.otherPost})`],
    ['community_post_likes', `id=eq.${ids.like}`],
    ['community_comments', `id=in.(${ids.comment},${ids.otherComment})`],
    ['job_invitations', `id=in.(${ids.invitation},${ids.foreignInvitation})`],
    ['jobs', `id=in.(${ids.job},${ids.otherJob})`],
  ] as const) {
    const select = name === 'notifications' ? 'id,is_read,actor_id,related_entity_id' : 'id';
    const response = await service.get(`/rest/v1/${TABLE}${name}?select=${select}&${clause}`);
    expect(response.status(), `QA snapshot ${name}`).toBe(200);
    result[name] = (await response.json()).sort((left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id));
  }
  return result;
}

async function verify(type: string, source: string, kind: string, actor: { uid: string; token: string }, recipient: string, allowed: boolean) {
  const before = await currentState();
  attempted.push({ source, actor: actor.uid, recipient, type });
  const response = await call(api, '/rest/v1/rpc/pb_create_client_notification', payload(type, source, kind, recipient), actor.token);
  if (allowed) {
    expect(response.status(), `valid ${type}`).toBe(200);
    const id = await response.json();
    const row = await service.get(`/rest/v1/${TABLE}notifications?select=id,actor_id,user_id,related_entity_type,related_entity_id,title,message,action_url&id=eq.${id}`);
    expect(row.status()).toBe(200);
    const [created] = await row.json();
    expect(created).toMatchObject({ actor_id: actor.uid, user_id: recipient, related_entity_type: kind, related_entity_id: source, message: null });
    expect(created.title).not.toBe(title);
    expect(created.action_url).not.toBe('/untrusted');
    const duplicate = await call(api, '/rest/v1/rpc/pb_create_client_notification', payload(type, source, kind, recipient), actor.token);
    expect(duplicate.status()).toBe(200);
    expect(await duplicate.json()).toBe(id);
  } else {
    expect([400, 403], `invalid ${type} must be denied`).toContain(response.status());
    expect(await currentState(), 'denial must be atomic and leave all QA/third-party rows unchanged').toEqual(before);
  }
}

test.describe('PB-NOTIFICATIONS-RPC-RELATION-HARDENING-001 QA-only security matrix', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.skip(process.env.QA_RPC_RELATIONS !== '1', 'explicit QA-only opt-in required');

  test.beforeAll(async () => {
    const url = process.env.QA_SUPABASE_URL ?? '';
    if (url !== `https://${QA_REF}.supabase.co`) throw new Error('QA project identity mismatch; refusing network writes');
    const key = process.env.QA_SUPABASE_ANON_KEY;
    const serviceKey = process.env.QA_SUPABASE_SERVICE_KEY;
    const fields = ['QA_COMPANY_EMAIL', 'QA_COMPANY_PASSWORD', 'QA_CANDIDATE_EMAIL', 'QA_CANDIDATE_PASSWORD', 'QA_THIRD_EMAIL', 'QA_THIRD_PASSWORD'];
    if (!key || !serviceKey || fields.some(field => !process.env[field])) throw new Error('QA-only test prerequisites missing');
    api = await pwRequest.newContext({ baseURL: url, extraHTTPHeaders: { apikey: key, 'Content-Type': 'application/json' } });
    service = await pwRequest.newContext({ baseURL: url, extraHTTPHeaders: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' } });
    company = await login(process.env.QA_COMPANY_EMAIL!, process.env.QA_COMPANY_PASSWORD!);
    worker = await login(process.env.QA_CANDIDATE_EMAIL!, process.env.QA_CANDIDATE_PASSWORD!);
    third = await login(process.env.QA_THIRD_EMAIL!, process.env.QA_THIRD_PASSWORD!);
    expect(new Set([company.uid, worker.uid, third.uid]).size).toBe(3);

    const profileResponse = await service.get(`/rest/v1/${TABLE}profiles?select=user_id,account_type&user_id=in.(${company.uid},${worker.uid},${third.uid})`);
    expect(profileResponse.status()).toBe(200);
    const profiles = await profileResponse.json() as { user_id: string; account_type: string }[];
    expect(profiles.find(p => p.user_id === company.uid)?.account_type).toBe('company');
    expect(profiles.find(p => p.user_id === worker.uid)?.account_type).toBe('worker');

    const anonProbe = await call(api, '/rest/v1/rpc/pb_create_client_notification', payload('like', randomUUID(), 'community_like', company.uid));
    expect([401, 403], 'QA must revoke anon EXECUTE before any fixture writes').toContain(anonProbe.status());
    for (const table of ['jobs', 'job_invitations', 'community_channels', 'community_posts', 'community_post_likes', 'community_comments', 'notifications']) {
      const access = await api.get(`/rest/v1/${TABLE}${table}?select=id&limit=0`, { headers: { Authorization: `Bearer ${worker.token}` } });
      expect(access.status(), `QA authenticated SELECT privilege missing on ${table}; stop before writes`).toBe(200);
    }

    ids.referral = await create('referrals', { referrer_id: company.uid, referred_id: worker.uid, status: 'pending' });
    ids.channel = await create('community_channels', { slug: `qa-rpc-${randomUUID()}`, name: title, is_public: true, created_by: company.uid });
    ids.post = await create('community_posts', { channel_id: ids.channel, user_id: company.uid, title, body: title });
    ids.otherPost = await create('community_posts', { channel_id: ids.channel, user_id: third.uid, title, body: title });
    ids.like = await create('community_post_likes', { post_id: ids.post, user_id: worker.uid });
    ids.comment = await create('community_comments', { post_id: ids.post, user_id: worker.uid, body: title });
    ids.otherComment = await create('community_comments', { post_id: ids.post, user_id: third.uid, body: title });
    ids.job = await create('jobs', { title, company: title, posted_by: company.uid, company_user_id: company.uid, status: 'open' });
    ids.otherJob = await create('jobs', { title, company: title, posted_by: third.uid, company_user_id: third.uid, status: 'open' });
    ids.invitation = await create('job_invitations', { company_user_id: company.uid, candidate_user_id: worker.uid, job_id: ids.job, status: 'pending' });
    ids.foreignInvitation = await create('job_invitations', { company_user_id: company.uid, candidate_user_id: worker.uid, job_id: ids.otherJob, status: 'pending' });
  });

  test.afterAll(async () => {
    if (!service) return;
    for (const item of attempted) {
      const query = new URLSearchParams({ actor_id: `eq.${item.actor}`, user_id: `eq.${item.recipient}`, type: `eq.${item.type}`, related_entity_id: `eq.${item.source}` });
      const result = await service.delete(`/rest/v1/${TABLE}notifications?${query}`);
      expect([200, 204]).toContain(result.status());
    }
    for (const [name, table] of [
      ['invitation', 'job_invitations'], ['foreignInvitation', 'job_invitations'],
      ['comment', 'community_comments'], ['otherComment', 'community_comments'],
      ['like', 'community_post_likes'], ['post', 'community_posts'], ['otherPost', 'community_posts'],
      ['job', 'jobs'], ['otherJob', 'jobs'], ['channel', 'community_channels'], ['referral', 'referrals'],
    ] as const) {
      if (!ids[name]) continue;
      const result = await service.delete(`/rest/v1/${TABLE}${table}?id=eq.${ids[name]}`);
      expect([200, 204]).toContain(result.status());
      const check = await service.get(`/rest/v1/${TABLE}${table}?select=id&id=eq.${ids[name]}`);
      expect(await check.json(), `fixture ${name} must be removed`).toEqual([]);
    }
    await Promise.all([api?.dispose(), service.dispose()]);
  });

  test('legitimate invitation, nonexistent invitation, foreign company/job, forged recipient and actor', async () => {
    await verify('job_invitation', ids.invitation, 'job_invitation', company, worker.uid, true);
    await verify('job_invitation', randomUUID(), 'job_invitation', company, worker.uid, false);
    await verify('job_invitation', ids.foreignInvitation, 'job_invitation', company, worker.uid, false);
    await verify('job_invitation', ids.invitation, 'job_invitation', company, third.uid, false);
    await verify('job_invitation', ids.invitation, 'job_invitation', third, worker.uid, false);
  });

  test('legitimate like, nonexistent like, wrong post, foreign actor and recipient', async () => {
    await verify('like', ids.like, 'community_like', worker, company.uid, true);
    await verify('like', randomUUID(), 'community_like', worker, company.uid, false);
    await verify('like', ids.like, 'community_like', worker, third.uid, false);
    await verify('like', ids.like, 'community_like', third, company.uid, false);
    await verify('like', ids.post, 'community_like', worker, company.uid, false);
  });

  test('legitimate comment, nonexistent comment, foreign comment and wrong recipient', async () => {
    await verify('comment', ids.comment, 'community_comment', worker, company.uid, true);
    await verify('comment', randomUUID(), 'community_comment', worker, company.uid, false);
    await verify('comment', ids.otherComment, 'community_comment', worker, company.uid, false);
    await verify('comment', ids.comment, 'community_comment', worker, third.uid, false);
  });

  test('referral relationship continues to notify legitimately', async () => {
    const before = await currentState();
    attempted.push({ source: ids.referral, actor: worker.uid, recipient: company.uid, type: 'REFERRAL_JOINED' });
    const response = await call(api, '/rest/v1/rpc/pb_create_client_notification', payload('REFERRAL_JOINED', ids.referral, 'referral', company.uid), worker.token);
    expect(response.status()).toBe(200);
    const id = await response.json();
    const result = await service.get(`/rest/v1/${TABLE}notifications?select=id,actor_id,user_id,type&id=eq.${id}`);
    expect((await result.json())[0]).toMatchObject({ actor_id: worker.uid, user_id: company.uid, type: 'REFERRAL_JOINED' });
    expect(await currentState()).not.toEqual(before);
  });

  test('anonymous, deleted source, unrelated type and owner isolation', async () => {
    const before = await currentState();
    const anonymous = await call(api, '/rest/v1/rpc/pb_create_client_notification', payload('like', ids.like, 'community_like', company.uid));
    expect([401, 403]).toContain(anonymous.status());
    const forbidden = await call(api, '/rest/v1/rpc/pb_create_client_notification', payload('ADMIN_BROADCAST', ids.like, 'community_like', company.uid), worker.token);
    expect([400, 403]).toContain(forbidden.status());
    expect(await currentState()).toEqual(before);
    const read = await api.get(`/rest/v1/${TABLE}notifications?select=id&user_id=eq.${company.uid}`, { headers: { Authorization: `Bearer ${worker.token}` } });
    expect(read.status()).toBe(200);
    expect(await read.json()).toEqual([]);
    const marked = await api.patch(`/rest/v1/${TABLE}notifications?user_id=eq.${company.uid}`, { data: { is_read: true }, headers: { Authorization: `Bearer ${worker.token}`, Prefer: 'return=representation' } });
    expect([200, 204]).toContain(marked.status());
    expect(await marked.json()).toEqual([]);
    const changed = await service.patch(`/rest/v1/${TABLE}community_posts?id=eq.${ids.post}`, { data: { is_deleted: true } });
    expect([200, 204]).toContain(changed.status());
    await verify('like', ids.like, 'community_like', worker, company.uid, false);
    await verify('comment', ids.comment, 'community_comment', worker, company.uid, false);
  });
});
