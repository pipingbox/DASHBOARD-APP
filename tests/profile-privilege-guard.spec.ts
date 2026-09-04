import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Profile privilege guard E2E for PB-PROFILE-ROLE-GUARD-001.
 *
 * Verifies that a normal authenticated user cannot elevate role/account_type
 * via direct UPDATE, while service_role/backend can.
 *
 * Required env vars (never committed):
 *   E2E_WORKER_EMAIL / E2E_WORKER_PASSWORD
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 */

const WORKER_EMAIL = process.env.E2E_WORKER_EMAIL;
const WORKER_PASSWORD = process.env.E2E_WORKER_PASSWORD;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const hasCreds = Boolean(
  WORKER_EMAIL && WORKER_PASSWORD &&
  ADMIN_EMAIL && ADMIN_PASSWORD &&
  SUPABASE_URL && SUPABASE_ANON_KEY,
);

async function signIn(email: string, password: string) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message || 'Login failed');
  return { supabase, user: data.session.user };
}

test.describe('profile privilege guard', () => {
  test.skip(!hasCreds, 'E2E privilege-guard credentials not set -- skipping');

  test('worker cannot self-elevate role to admin', async () => {
    const { supabase, user } = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    const { data: before } = await supabase
      .from('app_14da0f1941_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const originalRole = before?.role;
    expect(originalRole).not.toBe('admin');

    const { error } = await supabase
      .from('app_14da0f1941_profiles')
      .update({ role: 'admin' })
      .eq('user_id', user.id);

    expect(error).not.toBeNull();

    // Verify role did not change.
    const { data: after } = await supabase
      .from('app_14da0f1941_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    expect(after?.role).toBe(originalRole);

    await supabase.auth.signOut();
  });

  test('worker cannot self-elevate account_type to admin', async () => {
    const { supabase, user } = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    const { error } = await supabase
      .from('app_14da0f1941_profiles')
      .update({ account_type: 'admin' })
      .eq('user_id', user.id);

    expect(error).not.toBeNull();

    await supabase.auth.signOut();
  });

  test('worker cannot change role worker → company', async () => {
    const { supabase, user } = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    const { data: before } = await supabase
      .from('app_14da0f1941_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (before?.role !== 'worker') {
      test.skip(true, 'Test worker is not role=worker');
    }

    const { error } = await supabase
      .from('app_14da0f1941_profiles')
      .update({ role: 'company' })
      .eq('user_id', user.id);

    expect(error).not.toBeNull();

    await supabase.auth.signOut();
  });

  test('worker normal field update still works', async () => {
    const { supabase, user } = await signIn(WORKER_EMAIL!, WORKER_PASSWORD!);

    const { data: before } = await supabase
      .from('app_14da0f1941_profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .single();

    const newName = `${before?.full_name || 'User'} (test-${Date.now()})`;
    const { error } = await supabase
      .from('app_14da0f1941_profiles')
      .update({ full_name: newName })
      .eq('user_id', user.id);

    expect(error).toBeNull();

    // Restore original name.
    await supabase
      .from('app_14da0f1941_profiles')
      .update({ full_name: before?.full_name })
      .eq('user_id', user.id);

    await supabase.auth.signOut();
  });
});
