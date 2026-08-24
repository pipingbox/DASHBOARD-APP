import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * Schema contract regression tests — PB-ADMIN-ONBOARDING-SCHEMA-001.
 *
 * Background: `OnboardingWizard` used to add `onboarding_completed` to the same UPDATE that
 * writes `onboarding_status` and `marketplace_ready`. That column does not exist, so PostgREST
 * rejected the ENTIRE statement and both canonical fields were silently never written. Every
 * worker then scored 0 in job matching, because `calculateMatchScore` returns 0 when
 * `!marketplace_ready`.
 *
 * The defect was invisible because the progressive autosave uses a different payload that does
 * not include those fields, so the UI looked healthy.
 *
 * These tests assert the payload/schema contract against the real database. A unit test with a
 * mocked Supabase client would NOT have caught this: the bug lived in the mismatch between the
 * payload and the actual schema.
 *
 * Requires E2E_TEST_EMAIL / E2E_TEST_PASSWORD and VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

const PROFILES_TABLE = 'app_14da0f1941_profiles';

const hasConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY && EMAIL && PASSWORD);

test.describe('onboarding schema contract', () => {
  test.skip(
    !hasConfig,
    'Requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_TEST_EMAIL, E2E_TEST_PASSWORD',
  );

  let accessToken = '';
  let userId = '';
  let api: Awaited<ReturnType<typeof pwRequest.newContext>>;

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: SUPABASE_URL });

    const res = await api.post('/auth/v1/token?grant_type=password', {
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      data: { email: EMAIL, password: PASSWORD },
    });

    expect(res.status(), 'QA account must authenticate').toBe(200);
    const body = await res.json();
    accessToken = body.access_token;
    userId = body.user?.id;
    expect(accessToken, 'access token required').toBeTruthy();
    expect(userId, 'user id required').toBeTruthy();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  const authHeaders = () => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  });

  test('canonical onboarding columns exist and are selectable', async () => {
    const res = await api.get(
      `/rest/v1/${PROFILES_TABLE}?select=onboarding_status,marketplace_ready,profile_completion&user_id=eq.${userId}`,
      { headers: authHeaders() },
    );

    expect(
      res.status(),
      'selecting the canonical columns must not be rejected by PostgREST',
    ).toBe(200);

    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length, 'QA profile row must exist').toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('onboarding_status');
    expect(rows[0]).toHaveProperty('marketplace_ready');
  });

  test('onboarding_completed does not exist — writing it rejects the whole statement', async () => {
    // This is the exact failure mode of PB-ADMIN-ONBOARDING-SCHEMA-001.
    // We assert the rejection so that if the column is ever added, this test fails loudly
    // and forces a conscious decision instead of silently reintroducing two sources of truth.
    const res = await api.patch(
      `/rest/v1/${PROFILES_TABLE}?user_id=eq.${userId}`,
      {
        headers: authHeaders(),
        data: { onboarding_completed: true },
      },
    );

    expect(
      res.status(),
      'onboarding_completed must not exist; onboarding_status is canonical',
    ).toBeGreaterThanOrEqual(400);

    const body = await res.text();
    expect(body).toContain('onboarding_completed');
  });

  test('the wizard completion payload is accepted and actually persists', async () => {
    // Mirrors OnboardingWizard.saveAndFinish() for the public-profile branch.
    const before = await api.get(
      `/rest/v1/${PROFILES_TABLE}?select=onboarding_status,marketplace_ready&user_id=eq.${userId}`,
      { headers: authHeaders() },
    );
    const original = (await before.json())[0];

    const res = await api.patch(`/rest/v1/${PROFILES_TABLE}?user_id=eq.${userId}`, {
      headers: authHeaders(),
      data: {
        marketplace_ready: true,
        onboarding_status: 'MARKETPLACE_READY',
      },
    });

    expect(res.status(), 'canonical completion payload must be accepted').toBe(200);

    // The original defect was a silent no-op, so asserting the status code is not enough:
    // read the row back and confirm the values actually landed.
    const after = await api.get(
      `/rest/v1/${PROFILES_TABLE}?select=onboarding_status,marketplace_ready&user_id=eq.${userId}`,
      { headers: authHeaders() },
    );
    const updated = (await after.json())[0];

    expect(updated.onboarding_status).toBe('MARKETPLACE_READY');
    expect(updated.marketplace_ready).toBe(true);

    // Restore original state so the QA account stays reusable.
    await api.patch(`/rest/v1/${PROFILES_TABLE}?user_id=eq.${userId}`, {
      headers: authHeaders(),
      data: {
        marketplace_ready: original.marketplace_ready,
        onboarding_status: original.onboarding_status,
      },
    });
  });

  test('a marketplace-ready worker does not score 0 on the flag alone', async () => {
    // Guards the business consequence: calculateMatchScore() short-circuits to 0 when
    // marketplace_ready is false. If the flag never persists, matching is inert.
    const res = await api.get(
      `/rest/v1/${PROFILES_TABLE}?select=user_id&marketplace_ready=eq.true&limit=1`,
      { headers: authHeaders() },
    );

    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(
      rows.length,
      'at least one profile must be marketplace_ready, otherwise matching returns 0 for everyone',
    ).toBeGreaterThan(0);
  });
});
