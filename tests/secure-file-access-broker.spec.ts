import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Broker access E2E for PB-STORAGE-SECURITY-001.
 *
 * Verifies that the `secure-file-access` Edge Function:
 *   - allows owners to access their own CV;
 *   - allows authorized company viewers with a candidate relationship;
 *   - denies unauthorized company viewers;
 *   - never returns raw legacy URLs.
 *
 * Required env vars (never committed):
 *   E2E_WORKER_EMAIL / E2E_WORKER_PASSWORD
 *   E2E_COMPANY_AUTHORIZED_EMAIL / E2E_COMPANY_AUTHORIZED_PASSWORD
 *   E2E_COMPANY_UNAUTHORIZED_EMAIL / E2E_COMPANY_UNAUTHORIZED_PASSWORD
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *
 * The authorized company account must have an existing job-application
 * relationship with the worker account. The test does not mutate that
 * relationship.
 */

const WORKER_EMAIL = process.env.E2E_WORKER_EMAIL;
const WORKER_PASSWORD = process.env.E2E_WORKER_PASSWORD;
const COMPANY_AUTH_EMAIL = process.env.E2E_COMPANY_AUTHORIZED_EMAIL;
const COMPANY_AUTH_PASSWORD = process.env.E2E_COMPANY_AUTHORIZED_PASSWORD;
const COMPANY_UNAUTH_EMAIL = process.env.E2E_COMPANY_UNAUTHORIZED_EMAIL;
const COMPANY_UNAUTH_PASSWORD = process.env.E2E_COMPANY_UNAUTHORIZED_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const hasCreds = Boolean(
  WORKER_EMAIL && WORKER_PASSWORD &&
  COMPANY_AUTH_EMAIL && COMPANY_AUTH_PASSWORD &&
  COMPANY_UNAUTH_EMAIL && COMPANY_UNAUTH_PASSWORD &&
  SUPABASE_URL && SUPABASE_ANON_KEY,
);

async function signIn(email: string, password: string) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message || 'Login failed');
  return { supabase, user: data.session.user, accessToken: data.session.access_token };
}

test.describe('secure-file-access broker', () => {
  test.skip(!hasCreds, 'E2E broker credentials not set -- skipping broker access test');

  test('owner can retrieve a signed URL for their CV', async () => {
    const { supabase, user } = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    const { data: profile } = await supabase
      .from('app_14da0f1941_profiles')
      .select('cv_file_url')
      .eq('user_id', user.id)
      .single();

    test.skip(!profile?.cv_file_url, 'Worker has no CV uploaded -- skipping owner broker test');

    const { data, error } = await supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: user.id, file_type: 'cv' },
    });

    expect(error).toBeNull();
    expect(data?.signedUrl).toMatch(/[?&]token=/);
    expect(data?.signedUrl).not.toMatch(/\/object\/public\//);

    await supabase.auth.signOut();
  });

  test('authorized company can retrieve a signed URL for a visible CV', async () => {
    // First discover the worker user id and CV visibility.
    const workerClient = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const workerUserId = workerClient.user.id;
    const { data: profile } = await workerClient.supabase
      .from('app_14da0f1941_profiles')
      .select('cv_file_url, cv_visible')
      .eq('user_id', workerUserId)
      .single();

    test.skip(!profile?.cv_file_url || !profile.cv_visible, 'Worker has no visible CV -- skipping authorized company test');

    // Authorized company calls the broker.
    const companyClient = await signIn(COMPANY_AUTH_EMAIL!, COMPANY_AUTH_PASSWORD!);
    const { data, error } = await companyClient.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: workerUserId, file_type: 'cv' },
    });

    expect(error).toBeNull();
    expect(data?.signedUrl).toMatch(/[?&]token=/);

    await workerClient.supabase.auth.signOut();
    await companyClient.supabase.auth.signOut();
  });

  test('unauthorized company is denied access', async () => {
    const workerClient = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);
    const workerUserId = workerClient.user.id;

    const companyClient = await signIn(COMPANY_UNAUTH_EMAIL!, COMPANY_UNAUTH_PASSWORD!);
    const { data, error } = await companyClient.supabase.functions.invoke('secure-file-access', {
      body: { owner_user_id: workerUserId, file_type: 'cv' },
    });

    // The Edge Function returns 403 with a JSON body; supabase-js surfaces it
    // as a FunctionsHttpError or a normal response with error shape.
    const denied =
      error?.message?.toLowerCase().includes('not authorized') ||
      error?.message?.toLowerCase().includes('forbidden') ||
      data?.error?.toLowerCase().includes('not authorized') ||
      data?.error?.toLowerCase().includes('forbidden');
    expect(denied).toBe(true);

    await workerClient.supabase.auth.signOut();
    await companyClient.supabase.auth.signOut();
  });
});
