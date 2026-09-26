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
        // F-1-safe disposal: neutralize the row (owner UPDATE is verified) so it
        // can never pollute the readiness baseline while physical deletion is
        // blocked on sql/012.
        await api
          .patch(`/rest/v1/${TABLE}?id=eq.${fixtureId}`, {
            headers: authHeaders(),
            data: { company_name: '' },
          })
          .catch(() => null);
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
          `Rows neutralized (position/company emptied) and marked "${FIXTURE_MARKER}" on the disposable QA account; ` +
          'physical deletion pending sql/012; derived columns recalculated.',
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

test.describe('app_worker_experiences — cross-user isolation (QA A vs QA B, both directions)', () => {
  test(
    'cross-user isolation B→A and A→B (requires E2E_TEST_EMAIL_B / E2E_TEST_PASSWORD_B)',
    // This test must never pass vacuously. With the second identity present it
    // executes the real isolation checks IN BOTH DIRECTIONS; without them it
    // FAILS LOUDLY so the gap is visible in every run instead of hiding as a
    // skip (PO GO 2026-09-26 §3–4: no skips that hide missing credentials).
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

        const mkHeaders = (token: string) => ({
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        });

        // Both identities must be NORMAL users (PO §3: ninguna identidad es
        // administradora). Each principal reads their OWN profile row.
        const assertNonAdmin = async (userId: string, token: string, label: string) => {
          const res = await api.get(`/rest/v1/app_14da0f1941_profiles?user_id=eq.${userId}&select=role,account_type`, {
            headers: mkHeaders(token),
          });
          expect(res.status(), `${label} must be able to read their own profile`).toBe(200);
          const rows = (await res.json()) as Array<{ role?: string; account_type?: string }>;
          expect(rows.length, `${label} must have a profile row`).toBe(1);
          expect(rows[0].account_type, `${label} must NOT be an admin account`).not.toBe('admin');
          expect(rows[0].role, `${label} must NOT have the admin role`).not.toBe('admin');
        };
        await assertNonAdmin(a.userId, a.token, 'QA-A');
        await assertNonAdmin(b.userId, b.token, 'QA-B');

        /**
         * One-directional isolation check: `other` must not be able to read,
         * modify or delete a row owned by `owner`. The owner verifies their
         * own row's integrity before and after every forbidden attempt.
         * Fixture is created by the owner and deleted by the owner (exact id).
         */
        const assertIsolation = async (
          owner: { token: string; userId: string; label: string },
          other: { token: string; userId: string; label: string },
        ) => {
          const ownerH = () => mkHeaders(owner.token);
          const otherH = () => mkHeaders(other.token);

          // Owner creates a fixture (positive control for the owner side).
          const create = await api.post(`/rest/v1/${TABLE}`, {
            headers: { ...ownerH(), Prefer: 'return=representation' },
            data: { user_id: owner.userId, position: FIXTURE_MARKER, company_name: 'QA RLS cross-user' },
          });
          expect(create.status(), `${owner.label} must be able to create their own fixture`).toBeLessThan(400);
          const fixture = ((await create.json()) as Array<{ id: string }>)[0];
          expect(fixture?.id).toBeTruthy();

          try {
            // Other cannot READ the owner's row (approved visibility contract).
            const readOther = await api.get(`/rest/v1/${TABLE}?id=eq.${fixture.id}&select=id`, {
              headers: otherH(),
            });
            if (!isGenuineDenial(readOther.status())) {
              expect(readOther.status()).toBe(200);
              const rows = (await readOther.json()) as unknown[];
              expect(rows.length, `${other.label} must not see ${owner.label}’s experience row`).toBe(0);
            }

            // Other cannot UPDATE the owner's row — verified after by the owner.
            const updOther = await api.patch(`/rest/v1/${TABLE}?id=eq.${fixture.id}`, {
              headers: { ...otherH(), Prefer: 'return=representation' },
              data: { company_name: `TAMPERED-BY-${other.label}` },
            });
            if (!isGenuineDenial(updOther.status())) {
              expect(updOther.status(), 'cross UPDATE must be denied or affect zero rows').toBe(200);
              const changed = (await updOther.json()) as unknown[];
              expect(changed.length, 'cross UPDATE must affect zero rows').toBe(0);
            }
            const afterUpd = await api.get(`/rest/v1/${TABLE}?id=eq.${fixture.id}&select=company_name`, {
              headers: ownerH(),
            });
            const ownerRow = ((await afterUpd.json()) as Array<{ company_name: string }>)[0];
            expect(ownerRow?.company_name, 'owner state must be unchanged after the cross attempt').toBe(
              'QA RLS cross-user',
            );

            // Other cannot DELETE the owner's row — owner re-read confirms.
            const delOther = await api.delete(`/rest/v1/${TABLE}?id=eq.${fixture.id}`, {
              headers: { ...otherH(), Prefer: 'return=representation' },
            });
            if (!isGenuineDenial(delOther.status())) {
              expect(delOther.status()).toBe(200);
              const deleted = (await delOther.json()) as unknown[];
              expect(deleted.length, 'cross DELETE must affect zero rows').toBe(0);
            }
            const stillThere = await api.get(`/rest/v1/${TABLE}?id=eq.${fixture.id}&select=id`, {
              headers: ownerH(),
            });
            expect(
              ((await stillThere.json()) as unknown[]).length,
              `${owner.label}’s row must survive ${other.label}’s delete attempt`,
            ).toBe(1);

            // Other cannot INSERT a row attributed to the owner.
            const spoof = await api.post(`/rest/v1/${TABLE}`, {
              headers: { ...otherH(), Prefer: 'return=representation' },
              data: { user_id: owner.userId, position: FIXTURE_MARKER, company_name: 'spoof cross insert' },
            });
            if (!isGenuineDenial(spoof.status()) && spoof.status() < 400) {
              const rows = (await spoof.json()) as Array<{ id?: string; user_id?: string }>;
              expect(rows?.[0]?.user_id, 'a spoofed cross insert must never store the owner id').not.toBe(owner.userId);
              if (rows?.[0]?.id) {
                await api.delete(`/rest/v1/${TABLE}?id=eq.${rows[0].id}`, { headers: otherH() });
              }
            }
          } finally {
            // Owner-scoped cleanup of the exact fixture (F-1 grant makes this
            // a REAL delete; a failure is logged, not swallowed).
            const cleanup = await api.delete(`/rest/v1/${TABLE}?id=eq.${fixture.id}`, { headers: ownerH() });
            if (!cleanup.ok()) {
              console.error(
                `[rls-worker-experiences] cleanup failed for ${fixture.id} (${owner.label}): HTTP ${cleanup.status()}`,
              );
            }
          }
        };

        // Direction 1: B tries against A's row.
        await assertIsolation(
          { token: a.token, userId: a.userId, label: 'QA-A' },
          { token: b.token, userId: b.userId, label: 'QA-B' },
        );
        // Direction 2 (PO §4: "Verificar el sentido inverso A sobre B").
        await assertIsolation(
          { token: b.token, userId: b.userId, label: 'QA-B' },
          { token: a.token, userId: a.userId, label: 'QA-A' },
        );
      } finally {
        await api.dispose();
      }
    },
  );
});
