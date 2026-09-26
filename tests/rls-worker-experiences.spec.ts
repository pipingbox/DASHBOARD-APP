import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * RLS verification for app_worker_experiences — PB-WORKFORCE-ACTIVATION B1
 * (GO del PO 2026-09-26 §5). The lead-table suite is NOT a substitute: this
 * spec exercises the exact table WFA writes to, against the real PostgREST
 * endpoint with the real anon key.
 *
 * What one QA identity can prove (and this spec proves):
 *  - anon cannot READ / INSERT (genuine 401/403 or zero-row results only);
 *  - the OWNER can CRUD their own rows (positive controls — a suite where the
 *    owner can do nothing would also "pass" a broken endpoint);
 *  - the owner CANNOT insert a row attributed to a different user_id;
 *  - the owner CANNOT re-attribute their own row to a different user_id;
 *  - every forbidden attempt verifies before/after state on the exact fixture.
 *
 * What one QA identity CANNOT prove (reported, not skipped-as-pass):
 *  - that user A cannot read/modify/delete user B's actual rows. That needs a
 *    second non-admin QA identity: E2E_TEST_EMAIL_B / E2E_TEST_PASSWORD_B.
 *    Until those secrets exist, the CROSS-USER block reports itself as
 *    BLOCKED-MISSING-SECRET instead of passing vacuously.
 *
 * Fixture discipline (shared project with production): only exact ids created
 * by this run are touched; state is re-read by the owner after every forbidden
 * attempt; a failed cleanup is reported explicitly as PENDING.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
const EMAIL_B = process.env.E2E_TEST_EMAIL_B ?? '';
const PASSWORD_B = process.env.E2E_TEST_PASSWORD_B ?? '';

const TABLE = 'app_worker_experiences';
const FIXTURE_MARKER = 'WFA-RLS — automated, safe to delete';
/** A fabricated identity that is never the QA user — used for spoof attempts. */
const FOREIGN_USER = '00000000-0000-4000-8000-000000000001';

const hasAnonConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasAuthConfig = !!(hasAnonConfig && EMAIL && PASSWORD);
const hasSecondIdentity = !!(EMAIL_B && PASSWORD_B);

const isGenuineDenial = (status: number) => status === 401 || status === 403;

async function login(
  api: Awaited<ReturnType<typeof pwRequest.newContext>>,
  email: string,
  password: string,
): Promise<{ token: string; userId: string }> {
  const res = await api.post('/auth/v1/token?grant_type=password', {
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(res.status(), 'QA account must authenticate').toBe(200);
  const json = await res.json();
  expect(json.access_token).toBeTruthy();
  expect(json.user?.id).toBeTruthy();
  return { token: json.access_token, userId: json.user.id };
}

test.describe('app_worker_experiences — anonymous access', () => {
  test.skip(!hasAnonConfig, 'Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');

  let api: Awaited<ReturnType<typeof pwRequest.newContext>>;
  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  });
  test.afterAll(async () => {
    await api?.dispose();
  });

  const anonHeaders = () => ({ apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' });

  test('anon cannot READ experience rows', async () => {
    const res = await api.get(`/rest/v1/${TABLE}?select=id&limit=1`, { headers: anonHeaders() });
    if (isGenuineDenial(res.status())) return;
    expect(res.status(), 'anon read must be 401/403 or an empty 200').toBe(200);
    const rows = (await res.json()) as unknown[];
    expect(Array.isArray(rows) ? rows.length : -1, 'anon must see zero experience rows').toBe(0);
  });

  test('anon cannot INSERT an experience row', async () => {
    // No Prefer:return=representation: the RETURNING clause would 401 over the
    // missing SELECT privilege and say nothing about the INSERT privilege itself.
    const res = await api.post(`/rest/v1/${TABLE}`, {
      headers: anonHeaders(),
      data: { user_id: FOREIGN_USER, position: FIXTURE_MARKER, company_name: 'anon probe' },
    });
    expect(
      isGenuineDenial(res.status()),
      `anon INSERT must be denied with 401/403, got ${res.status()}`,
    ).toBe(true);
  });
});

test.describe('app_worker_experiences — owner controls and spoof attempts (QA identity A)', () => {
  test.skip(!hasAuthConfig, 'Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD in addition to Supabase config');

  let api: Awaited<ReturnType<typeof pwRequest.newContext>>;
  let token = '';
  let userId = '';
  let fixtureId = '';
  const pendingCleanup: string[] = [];

  const authHeaders = () => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const readFixture = async (): Promise<Record<string, unknown> | null> => {
    const res = await api.get(`/rest/v1/${TABLE}?id=eq.${fixtureId}&select=*`, { headers: authHeaders() });
    expect(res.status(), 'owner must be able to re-read the fixture').toBe(200);
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows[0] ?? null;
  };

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
    ({ token, userId } = await login(api, EMAIL, PASSWORD));
  });

  test.afterAll(async () => {
    // Owner-scoped cleanup of the exact fixture; a failure is PENDING, never silent.
    if (fixtureId) {
      const res = await api
        .delete(`/rest/v1/${TABLE}?id=eq.${fixtureId}`, { headers: authHeaders() })
        .catch(() => null);
      if (!res || !res.ok()) {
        pendingCleanup.push(fixtureId);
        console.error(
          `[rls-worker-experiences] F-1: afterAll owner DELETE returned HTTP ${res ? res.status() : 'network-error'}`,
        );
      }
    }
    if (pendingCleanup.length > 0) {
      // Keep the DERIVED profile columns coherent with the leftover rows so
      // specs sharing this QA account are not polluted by stale derived state.
      await api
        .post('/functions/v1/recalculate-profiles', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: { user_id: userId },
          timeout: 20_000,
        })
        .catch(() => null);
      console.warn(
        `[rls-worker-experiences] PENDING CLEANUP (F-1 owner-DELETE gap): ${pendingCleanup.join(', ')}. ` +
          `Rows are marked "${FIXTURE_MARKER}" on the disposable QA account; derived columns recalculated.`,
      );
    }
    await api?.dispose();
  });

  test('POSITIVE CONTROL: owner can INSERT their own experience', async () => {
    const res = await api.post(`/rest/v1/${TABLE}`, {
      headers: { ...authHeaders(), Prefer: 'return=representation' },
      data: { user_id: userId, position: FIXTURE_MARKER, company_name: 'QA RLS Company' },
    });
    expect(res.status(), 'owner insert must succeed (positive control)').toBeLessThan(400);
    const rows = (await res.json()) as Array<{ id?: string; user_id?: string }>;
    fixtureId = String(rows?.[0]?.id ?? '');
    expect(fixtureId, 'owner insert must return the row id').toBeTruthy();
    expect(rows[0].user_id, 'the stored row must belong to the caller').toBe(userId);
  });

  test('POSITIVE CONTROL: owner can READ and UPDATE their own row', async () => {
    const before = await readFixture();
    expect(before?.position).toBe(FIXTURE_MARKER);

    const res = await api.patch(`/rest/v1/${TABLE}?id=eq.${fixtureId}`, {
      headers: { ...authHeaders(), Prefer: 'return=representation' },
      data: { company_name: 'QA RLS Company (updated by owner)' },
    });
    expect(res.status(), 'owner update must succeed (positive control)').toBeLessThan(400);
    const after = await readFixture();
    expect(after?.company_name).toBe('QA RLS Company (updated by owner)');
  });

  test('owner CANNOT insert a row attributed to a different user_id', async () => {
    const res = await api.post(`/rest/v1/${TABLE}`, {
      headers: { ...authHeaders(), Prefer: 'return=representation' },
      data: { user_id: FOREIGN_USER, position: FIXTURE_MARKER, company_name: 'spoof probe' },
    });

    if (isGenuineDenial(res.status())) return; // denied outright — pass
    if (res.status() < 400) {
      // If PostgREST accepted it, the stored row must NOT belong to the foreign id
      // (a coercing trigger would be acceptable; an attributed spoof is NOT).
      const rows = (await res.json()) as Array<{ id?: string; user_id?: string }>;
      const stored = rows?.[0];
      expect(stored?.user_id, 'a spoofed user_id must never be stored').not.toBe(FOREIGN_USER);
      if (stored?.id) pendingCleanup.push(String(stored.id));
      return;
    }
    throw new Error(`spoof INSERT: unexpected status ${res.status()} (not a genuine denial)`);
  });

  test('owner CANNOT re-attribute their own row to a different user_id', async () => {
    const before = await readFixture();
    expect(before?.user_id, 'fixture must belong to the QA user before the attempt').toBe(userId);

    const res = await api.patch(`/rest/v1/${TABLE}?id=eq.${fixtureId}`, {
      headers: { ...authHeaders(), Prefer: 'return=representation' },
      data: { user_id: FOREIGN_USER },
    });

    if (!isGenuineDenial(res.status()) && res.status() >= 400) {
      throw new Error(`re-ownership UPDATE: unexpected status ${res.status()} (not a genuine denial)`);
    }
    // Whether denied or silently no-op, the AFTER state is the real assertion.
    const after = await readFixture();
    expect(after?.user_id, 'ownership must remain with the legitimate owner after the attempt').toBe(userId);
  });

  test('POSITIVE CONTROL: owner can DELETE their own row', async () => {
    const res = await api.delete(`/rest/v1/${TABLE}?id=eq.${fixtureId}`, { headers: authHeaders() });
    if (!res.ok()) {
      // F-1 (B3 blocker): the UI exposes a delete affordance; if the owner
      // cannot actually delete, the optimistic UI removal is a FALSE SUCCESS.
      console.error(
        `[rls-worker-experiences] F-1: owner DELETE returned HTTP ${res.status()} — ` +
          `body: ${(await res.text()).slice(0, 300)}`,
      );
    }
    expect(res.ok(), 'owner delete must succeed (positive control) — see F-1').toBeTruthy();
    const gone = await readFixture();
    expect(gone, 'the fixture must be gone after the owner delete').toBeNull();
    fixtureId = ''; // already cleaned
  });
});

test.describe('app_worker_experiences — cross-user isolation (QA A vs QA B)', () => {
  test(
    'BLOCKED-MISSING-SECRET: cross-user isolation requires E2E_TEST_EMAIL_B / E2E_TEST_PASSWORD_B',
    // This test must never pass vacuously. With the second identity present it
    // executes the real isolation checks; without them it FAILS LOUDLY so the
    // gap is visible in every run instead of hiding as a skip.
    async () => {
      test.skip(!hasAnonConfig, 'Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
      expect(
        hasSecondIdentity,
        'Cross-user RLS isolation is UNVERIFIED: configure E2E_TEST_EMAIL_B and ' +
          'E2E_TEST_PASSWORD_B (a second non-admin QA identity) as GitHub Secrets. ' +
          'Without them, B3 cannot leave HOLD.',
      ).toBe(true);

      const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
      try {
        const a = await login(api, EMAIL, PASSWORD);
        const b = await login(api, EMAIL_B, PASSWORD_B);
        expect(b.userId, 'identity B must be a DIFFERENT user').not.toBe(a.userId);

        const headersA = () => ({
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${a.token}`,
          'Content-Type': 'application/json',
        });
        const headersB = () => ({
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${b.token}`,
          'Content-Type': 'application/json',
        });

        // A creates a fixture (positive control).
        const create = await api.post(`/rest/v1/${TABLE}`, {
          headers: { ...headersA(), Prefer: 'return=representation' },
          data: { user_id: a.userId, position: FIXTURE_MARKER, company_name: 'QA RLS cross-user' },
        });
        expect(create.status()).toBeLessThan(400);
        const fixture = ((await create.json()) as Array<{ id: string }>)[0];
        expect(fixture?.id).toBeTruthy();

        try {
          // B cannot read A's private row (visibility contract: at minimum B
          // must not be able to WRITE it; read is asserted per the approved
          // visibility contract — adjust only with an explicit contract change).
          const readB = await api.get(`/rest/v1/${TABLE}?id=eq.${fixture.id}&select=id`, { headers: headersB() });
          if (!isGenuineDenial(readB.status())) {
            expect(readB.status()).toBe(200);
            const rows = (await readB.json()) as unknown[];
            expect(rows.length, 'B must not see A’s experience row').toBe(0);
          }

          // B cannot UPDATE A's row — verified before/after by the owner.
          const updB = await api.patch(`/rest/v1/${TABLE}?id=eq.${fixture.id}`, {
            headers: { ...headersB(), Prefer: 'return=representation' },
            data: { company_name: 'TAMPERED-BY-B' },
          });
          if (!isGenuineDenial(updB.status())) {
            expect(updB.status(), 'B UPDATE must be denied or affect zero rows').toBe(200);
            const changed = (await updB.json()) as unknown[];
            expect(changed.length, 'B UPDATE must affect zero rows').toBe(0);
          }
          const afterUpd = await api.get(`/rest/v1/${TABLE}?id=eq.${fixture.id}&select=company_name`, {
            headers: headersA(),
          });
          const ownerRow = ((await afterUpd.json()) as Array<{ company_name: string }>)[0];
          expect(ownerRow?.company_name, 'owner state must be unchanged after B’s attempt').toBe(
            'QA RLS cross-user',
          );

          // B cannot DELETE A's row — owner re-read confirms.
          const delB = await api.delete(`/rest/v1/${TABLE}?id=eq.${fixture.id}`, {
            headers: { ...headersB(), Prefer: 'return=representation' },
          });
          if (!isGenuineDenial(delB.status())) {
            expect(delB.status()).toBe(200);
            const deleted = (await delB.json()) as unknown[];
            expect(deleted.length, 'B DELETE must affect zero rows').toBe(0);
          }
          const stillThere = await api.get(`/rest/v1/${TABLE}?id=eq.${fixture.id}&select=id`, {
            headers: headersA(),
          });
          expect(((await stillThere.json()) as unknown[]).length, 'A’s row must survive B’s delete attempt').toBe(1);
        } finally {
          // Owner-scoped cleanup of the exact fixture.
          await api.delete(`/rest/v1/${TABLE}?id=eq.${fixture.id}`, { headers: headersA() });
        }
      } finally {
        await api.dispose();
      }
    },
  );
});
