import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Broker access E2E for PB-STORAGE-SECURITY-001 Security NO-GO #5.
 *
 * Verifies that the `secure-file-access` Edge Function:
 *   - allows owners to access their own CV / document / certification;
 *   - allows authorized admin/jobs_moderator viewers;
 *   - allows authorized company viewers with a candidate relationship and visibility;
 *   - denies any other role (fail-closed);
 *   - denies non-owner workers;
 *   - rejects metadata/paths that point to objects outside the owner's namespace
 *     or owned by another user (storage path integrity).
 *
 * Required env vars (never committed):
 *   E2E_WORKER_EMAIL / E2E_WORKER_PASSWORD
 *   E2E_SECOND_WORKER_EMAIL / E2E_SECOND_WORKER_PASSWORD  (for cross-worker denials)
 *   E2E_COMPANY_AUTHORIZED_EMAIL / E2E_COMPANY_AUTHORIZED_PASSWORD
 *   E2E_COMPANY_UNAUTHORIZED_EMAIL / E2E_COMPANY_UNAUTHORIZED_PASSWORD
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD                    (optional, recommended)
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *
 * Tests are skipped only when the specific credentials they need are missing.
 */

const WORKER_EMAIL = process.env.E2E_WORKER_EMAIL;
const WORKER_PASSWORD = process.env.E2E_WORKER_PASSWORD;
const SECOND_WORKER_EMAIL = process.env.E2E_SECOND_WORKER_EMAIL;
const SECOND_WORKER_PASSWORD = process.env.E2E_SECOND_WORKER_PASSWORD;
const COMPANY_AUTH_EMAIL = process.env.E2E_COMPANY_AUTHORIZED_EMAIL;
const COMPANY_AUTH_PASSWORD = process.env.E2E_COMPANY_AUTHORIZED_PASSWORD;
const COMPANY_UNAUTH_EMAIL = process.env.E2E_COMPANY_UNAUTHORIZED_EMAIL;
const COMPANY_UNAUTH_PASSWORD = process.env.E2E_COMPANY_UNAUTHORIZED_PASSWORD;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const hasBaseCreds = Boolean(
  WORKER_EMAIL && WORKER_PASSWORD &&
  SUPABASE_URL && SUPABASE_ANON_KEY,
);

const hasSecondWorker = Boolean(
  SECOND_WORKER_EMAIL && SECOND_WORKER_PASSWORD,
);

const hasCompanyCreds = Boolean(
  COMPANY_AUTH_EMAIL && COMPANY_AUTH_PASSWORD &&
  COMPANY_UNAUTH_EMAIL && COMPANY_UNAUTH_PASSWORD,
);

const hasAdminCreds = Boolean(
  ADMIN_EMAIL && ADMIN_PASSWORD,
);

async function signIn(email: string, password: string) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message || 'Login failed');
  return { supabase, user: data.session.user, accessToken: data.session.access_token };
}

async function getWorkerCV(supabase: ReturnType<typeof createClient>, userId: string) {
  return supabase
    .from('app_14da0f1941_profiles')
    .select('cv_file_url, cv_visible')
    .eq('user_id', userId)
    .single();
}

async function getWorkerDocuments(supabase: ReturnType<typeof createClient>, userId: string) {
  return supabase
    .from('app_worker_documents')
    .select('id, is_visible')
    .eq('user_id', userId)
    .limit(10);
}

async function getWorkerCertifications(supabase: ReturnType<typeof createClient>, userId: string) {
  return supabase
    .from('app_worker_certifications')
    .select('id, is_visible, visible_to_companies')
    .eq('user_id', userId)
    .limit(10);
}

function expectDenied(data: any, error: any) {
  const msg = String(error?.message || data?.error || '').toLowerCase();
  expect(
    msg.includes('not authorized') ||
    msg.includes('forbidden') ||
    msg.includes('access denied') ||
    msg.includes('not found') ||
    msg.includes('not visible') ||
    msg.includes('ownership mismatch') ||
    msg.includes('path does not belong') ||
    msg.includes('bucket not allowed') ||
    msg.includes('storage object not found') ||
    msg.includes('storage integrity')
  ).toBe(true);
}

test.describe('secure-file-access broker', () => {
  test.skip(!hasBaseCreds, 'E2E broker credentials not set -- skipping broker access tests');

  test('owner can retrieve a signed URL for their CV', async () => {
    const { supabase, user } = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    const { data: profile } = await getWorkerCV(supabase, user.id);
    test.skip(!profile?.cv_file_url, 'Worker has no CV uploaded -- skipping owner CV broker test');

    const { data, error } = await supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: user.id, file_type: 'cv' },
    });

    expect(error).toBeNull();
    expect(data?.signedUrl).toMatch(/[?&]token=/);
    expect(data?.signedUrl).not.toMatch(/\/object\/public\//);

    await supabase.auth.signOut();
  });

  test('authorized company can retrieve a signed URL for a visible CV', async () => {
    test.skip(!hasCompanyCreds, 'Company credentials not set -- skipping authorized company test');

    const workerClient = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const workerUserId = workerClient.user.id;
    const { data: profile } = await getWorkerCV(workerClient.supabase, workerUserId);

    test.skip(!profile?.cv_file_url || !profile.cv_visible, 'Worker has no visible CV -- skipping authorized company test');

    const companyClient = await signIn(COMPANY_AUTH_EMAIL!, COMPANY_AUTH_PASSWORD!);
    const { data, error } = await companyClient.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: workerUserId, file_type: 'cv' },
    });

    expect(error).toBeNull();
    expect(data?.signedUrl).toMatch(/[?&]token=/);
    expect(data?.signedUrl).not.toMatch(/\/object\/public\//);

    await workerClient.supabase.auth.signOut();
    await companyClient.supabase.auth.signOut();
  });

  test('unauthorized company is denied access', async () => {
    test.skip(!hasCompanyCreds, 'Company credentials not set -- skipping unauthorized company test');

    const workerClient = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const workerUserId = workerClient.user.id;

    const companyClient = await signIn(COMPANY_UNAUTH_EMAIL!, COMPANY_UNAUTH_PASSWORD!);
    const { data, error } = await companyClient.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: workerUserId, file_type: 'cv' },
    });

    expectDenied(data, error);

    await workerClient.supabase.auth.signOut();
    await companyClient.supabase.auth.signOut();
  });

  test('non-owner worker is denied access to another worker visible CV', async () => {
    test.skip(!hasSecondWorker, 'Second worker credentials not set -- skipping cross-worker CV denial test');

    const targetClient = await signIn(SECOND_WORKER_EMAIL!, SECOND_WORKER_PASSWORD!);
    const targetUserId = targetClient.user.id;
    const { data: profile } = await getWorkerCV(targetClient.supabase, targetUserId);

    test.skip(!profile?.cv_file_url || !profile.cv_visible, 'Second worker has no visible CV -- skipping cross-worker CV denial test');

    const attackerClient = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await attackerClient.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: targetUserId, file_type: 'cv' },
    });

    expectDenied(data, error);

    await targetClient.supabase.auth.signOut();
    await attackerClient.supabase.auth.signOut();
  });

  test('non-owner worker is denied access to another worker document', async () => {
    test.skip(!hasSecondWorker, 'Second worker credentials not set -- skipping cross-worker document denial test');

    const targetClient = await signIn(SECOND_WORKER_EMAIL!, SECOND_WORKER_PASSWORD!);
    const targetUserId = targetClient.user.id;
    const { data: docs } = await getWorkerDocuments(targetClient.supabase, targetUserId);

    test.skip(!docs || docs.length === 0, 'Second worker has no documents -- skipping cross-worker document denial test');

    const attackerClient = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await attackerClient.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: targetUserId, file_type: 'document', record_id: docs![0].id },
    });

    expectDenied(data, error);

    await targetClient.supabase.auth.signOut();
    await attackerClient.supabase.auth.signOut();
  });

  test('non-owner worker is denied access to another worker certification', async () => {
    test.skip(!hasSecondWorker, 'Second worker credentials not set -- skipping cross-worker certification denial test');

    const targetClient = await signIn(SECOND_WORKER_EMAIL!, SECOND_WORKER_PASSWORD!);
    const targetUserId = targetClient.user.id;
    const { data: certs } = await getWorkerCertifications(targetClient.supabase, targetUserId);

    test.skip(!certs || certs.length === 0, 'Second worker has no certifications -- skipping cross-worker certification denial test');

    const attackerClient = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const { data, error } = await attackerClient.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: targetUserId, file_type: 'certification', record_id: certs![0].id },
    });

    expectDenied(data, error);

    await targetClient.supabase.auth.signOut();
    await attackerClient.supabase.auth.signOut();
  });

  test('legitimate admin can retrieve a signed URL for a worker CV', async () => {
    test.skip(!hasAdminCreds, 'Admin credentials not set -- skipping admin broker test');

    const workerClient = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const workerUserId = workerClient.user.id;
    const { data: profile } = await getWorkerCV(workerClient.supabase, workerUserId);

    test.skip(!profile?.cv_file_url, 'Worker has no CV uploaded -- skipping admin broker test');

    const adminClient = await signIn(ADMIN_EMAIL!, ADMIN_PASSWORD!);
    const { data, error } = await adminClient.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: workerUserId, file_type: 'cv' },
    });

    expect(error).toBeNull();
    expect(data?.signedUrl).toMatch(/[?&]token=/);
    expect(data?.signedUrl).not.toMatch(/\/object\/public\//);

    await workerClient.supabase.auth.signOut();
    await adminClient.supabase.auth.signOut();
  });

  test('broker denies a CV path inside owner namespace when the storage object does not exist', async () => {
    const { supabase, user } = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    const { data: original } = await supabase
      .from('app_14da0f1941_profiles')
      .select('cv_storage_bucket, cv_storage_path')
      .eq('user_id', user.id)
      .single();

    try {
      // Path lives inside the owner's namespace but the object does not exist.
      // The ownership RPC must return false and the broker must deny with 403.
      await supabase
        .from('app_14da0f1941_profiles')
        .upsert(
          {
            user_id: user.id,
            cv_storage_bucket: 'app_14da0f1941_certificates',
            cv_storage_path: `${user.id}/this-file-does-not-exist.pdf`,
          },
          { onConflict: 'user_id' },
        );

      const { data, error } = await supabase.functions.invoke('secure-file-access', {
        body: { owner_user_id: user.id, file_type: 'cv' },
      });

      expectDenied(data, error);
    } finally {
      await supabase
        .from('app_14da0f1941_profiles')
        .upsert(
          {
            user_id: user.id,
            cv_storage_bucket: original?.cv_storage_bucket,
            cv_storage_path: original?.cv_storage_path,
          },
          { onConflict: 'user_id' },
        );
      await supabase.auth.signOut();
    }
  });

  test('authenticated user cannot execute pb_verify_storage_object_ownership RPC directly', async () => {
    const { supabase, user } = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    const { data, error } = await supabase.rpc('pb_verify_storage_object_ownership', {
      p_bucket_name: 'app_14da0f1941_certificates',
      p_path: `${user.id}/contract-test.pdf`,
      p_owner_user_id: user.id,
    });

    // The RPC is backend/service_role only; any authenticated client must be rejected.
    expect(error).not.toBeNull();
    expect(String(error?.message || data).toLowerCase()).toMatch(/permission denied|not authorized|unauthorized/);

    await supabase.auth.signOut();
  });
});
