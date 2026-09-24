import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
if (!url || !key || !email || !password) throw new Error('Feedback live gate requires the QA secrets');
if (!email.startsWith('qa.e2e')) throw new Error('Feedback live gate only runs with the disposable QA account');

const anonymous = createClient(url, key, { auth: { persistSession: false } });
const authenticated = createClient(url, key, { auth: { persistSession: false } });
const origin = 'https://pipingbox-app.pipingbox.workers.dev';
const tag = `feedback-live-${process.env.GITHUB_RUN_ID || Date.now()}`;
const base = { category: 'translation', locale: 'ro', route: '/register', visible_text: 'Autentificare în curs…', suggested_text: tag };
const send = (client, body, headers = {}) =>
  client.functions.invoke('submit-beta-feedback', { body, headers: { Origin: origin, ...headers } });

test('anonymous report persists while direct table and Storage writes stay denied', async () => {
  const { data, error } = await send(anonymous, base);
  assert.ifError(error);
  assert.equal(data?.created, true);
  assert.match(data.id, /^[\da-f-]{36}$/);
  const direct = await anonymous.from('beta_feedback_reports').insert({ category: 'translation', description: tag });
  assert.ok(direct.error, 'anonymous INSERT on beta_feedback_reports must stay denied');
  const upload = await anonymous.storage.from('feedback-screenshots')
    .upload(`feedback/${crypto.randomUUID()}/qa.png`, new Blob(['qa'], { type: 'image/png' }));
  assert.ok(upload.error, 'anonymous upload to feedback-screenshots must stay denied');
});

test('forged client addresses cannot buy extra anonymous quota', async () => {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const spoofed = `203.0.113.${attempt}`;
    const { error } = await send(anonymous, { ...base, suggested_text: `${tag}-anon-${attempt}` }, {
      'cf-connecting-ip': spoofed,
      'x-real-ip': spoofed,
      'x-forwarded-for': spoofed,
    });
    if (error) {
      assert.equal(error.context?.status, 429, `attempt ${attempt} failed for an unexpected reason`);
      return;
    }
  }
  assert.fail('six anonymous reports with forged addresses all succeeded: the limiter trusts client headers');
});

test('authenticated report binds the verified identity, rejects spoofing and returns HTTP 429', async () => {
  const signedIn = await authenticated.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  assert.ok(signedIn.data.session?.access_token, 'QA sign-in must return a session');
  const forged = await send(authenticated, { ...base, user_id: crypto.randomUUID() });
  assert.equal(forged.error?.context?.status, 400, 'client-supplied identity must be rejected');
  let created = 0;
  for (let attempt = 1; attempt <= 21; attempt++) {
    const { data, error } = await send(authenticated, { ...base, suggested_text: `${tag}-auth-${attempt}` });
    if (error) {
      assert.equal(error.context?.status, 429, `attempt ${attempt} failed for an unexpected reason`);
      assert.ok(created > 0, 'authenticated reports must persist before the limit applies');
      return;
    }
    assert.equal(data?.created, true);
    created++;
  }
  assert.fail('authenticated reports never hit the hourly limit');
});
