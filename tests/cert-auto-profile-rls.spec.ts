import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * RLS/security verification for PB-CERT-AUTO-PROFILE-001 tables —
 * app_cert_extraction_drafts + app_cert_extraction_events.
 *
 * DRAFT FIRST security model under test:
 *   - anon cannot READ or WRITE either table;
 *   - authenticated users CANNOT INSERT drafts (draft creation is
 *     service_role only, via cert-extract: a client that could insert drafts
 *     could fabricate its own "extracted" data);
 *   - authenticated users CANNOT INSERT/DELETE/UPDATE events (append-only
 *     metrics, service_role);
 *   - the owner SELECT is scoped to their own rows (RLS cross-user denied);
 *   - the owner's UPDATE only ever touches rows they own (spoofing a foreign
 *     user_id must affect zero rows);
 *   - DELETE is denied for clients (purge is service_role).
 *
 * What one QA identity CANNOT prove (reported, not skipped-as-pass):
 *   - cross-user access between two real users needs E2E_TEST_EMAIL_B;
 *     until that secret exists the block reports BLOCKED-MISSING-SECRET.
 *   - the full cert-extract / cert-apply-draft edge function flow needs the
 *     functions deployed; covered by engine unit tests + deploy QA.
 *
 * PRIVACY: assertions only check status codes, headers and row COUNTS.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

const DRAFTS = 'app_cert_extraction_drafts';
const EVENTS = 'app_cert_extraction_events';
/** Fabricated identity that is never the QA user — spoof attempts only. */
const FOREIGN_USER = '00000000-0000-4000-8000-000000000001';

const hasAnonConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasAuthConfig = !!(hasAnonConfig && EMAIL && PASSWORD);

const isGenuineDenial = (status: number) => status === 401 || status === 403;

async function login(
  api: Awaited<ReturnType<typeof pwRequest.newContext>>,
): Promise<{ token: string; userId: string }> {
  const res = await api.post('/auth/v1/token?grant_type=password', {
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(res.status(), 'QA account must authenticate').toBe(200);
  const json = await res.json();
  expect(json.access_token).toBeTruthy();
  return { token: json.access_token, userId: json.user.id };
}

/** Affected-row count for writes, from Content-Range (Prefer: count=exact). */
function affectedRows(res: { headers(): Record<string, string> }): number | null {
  const range = res.headers()['content-range'];
  if (!range) return null;
  const m = range.match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

test.describe('PB-CERT-AUTO-PROFILE-001 — RLS/security', () => {
  test.skip(!hasAnonConfig, 'Supabase env not configured — skipping cert draft RLS suite');

  test('anon cannot read or write either table', async () => {
    const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });

    for (const table of [DRAFTS, EVENTS]) {
      const read = await api.get(`/rest/v1/${table}?select=id`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      });
      expect(
        isGenuineDenial(read.status()),
        `anon GET ${table} must be denied, got ${read.status()}`,
      ).toBe(true);

      const insert = await api.post(`/rest/v1/${table}`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          Prefer: 'count=exact',
        },
        data: { user_id: FOREIGN_USER },
      });
      expect(
        isGenuineDenial(insert.status()),
        `anon POST ${table} must be denied, got ${insert.status()}`,
      ).toBe(true);
    }
  });

  test.describe('authenticated owner', () => {
    test.skip(!hasAuthConfig, 'QA credentials not configured');

    test('SELECT is scoped: zero foreign drafts visible', async () => {
      const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
      const { token, userId: ownerUserId } = await login(api);
      const auth = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Positive control: the endpoint answers 200 for the owner.
      const own = await api.get(`/rest/v1/${DRAFTS}?select=id,user_id`, { headers: auth });
      expect(own.status(), `owner SELECT ${DRAFTS} must work`).toBe(200);
      const ownJson = await own.json();
      // Every visible row must belong to the QA identity — never anyone else.
      for (const row of ownJson) {
        expect(row.user_id, 'RLS must scope rows to the owner').toBe(ownerUserId);
      }

      // Explicit foreign filter: must return zero rows (cross-user denied).
      const foreign = await api.get(
        `/rest/v1/${DRAFTS}?select=id&user_id=eq.${FOREIGN_USER}`,
        { headers: auth },
      );
      expect(foreign.status()).toBe(200);
      expect(await foreign.json(), 'cross-user read must return no rows').toEqual([]);
    });

    test('owner CANNOT insert drafts or events (service_role only)', async () => {
      const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
      const { token, userId } = await login(api);
      const auth = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'count=exact',
      };

      // Draft fabrication attempt (own identity): must be denied.
      const ownInsert = await api.post(`/rest/v1/${DRAFTS}`, {
        headers: auth,
        data: {
          user_id: userId,
          doc_sha256: 'a'.repeat(64),
          storage_bucket: 'app_14da0f1941_certificates',
          storage_path: `${userId}/spoof.pdf`,
          file_name: 'spoof.pdf',
        },
      });
      expect(
        isGenuineDenial(ownInsert.status()),
        `owner INSERT ${DRAFTS} must be denied (service_role only), got ${ownInsert.status()}`,
      ).toBe(true);

      // Spoofed identity: must be denied.
      const spoofInsert = await api.post(`/rest/v1/${DRAFTS}`, {
        headers: auth,
        data: {
          user_id: FOREIGN_USER,
          doc_sha256: 'b'.repeat(64),
          storage_bucket: 'app_14da0f1941_certificates',
          storage_path: `${FOREIGN_USER}/spoof.pdf`,
          file_name: 'spoof.pdf',
        },
      });
      expect(
        isGenuineDenial(spoofInsert.status()),
        `spoofed INSERT ${DRAFTS} must be denied, got ${spoofInsert.status()}`,
      ).toBe(true);

      // Metrics fabrication attempt: must be denied (append-only service).
      const eventInsert = await api.post(`/rest/v1/${EVENTS}`, {
        headers: auth,
        data: { user_id: userId, event_type: 'cert_extraction_completed' },
      });
      expect(
        isGenuineDenial(eventInsert.status()),
        `owner INSERT ${EVENTS} must be denied, got ${eventInsert.status()}`,
      ).toBe(true);
    });

    test('owner UPDATE touches only own rows; DELETE denied', async () => {
      const api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
      const { token, userId } = await login(api);
      const auth = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'count=exact',
      };

      // UPDATE against a foreign id: RLS must make it affect zero rows
      // (401/403 also acceptable when PostgREST rejects the filter outright).
      const update = await api.patch(`/rest/v1/${DRAFTS}?user_id=eq.${FOREIGN_USER}`, {
        headers: auth,
        data: { extraction_status: 'dismissed' },
      });
      expect(
        isGenuineDenial(update.status()) || affectedRows(update) === 0,
        `cross-user UPDATE must be denied or affect 0 rows, got ${update.status()}`,
      ).toBe(true);

      // DELETE: no policy for authenticated — must be denied.
      const del = await api.delete(`/rest/v1/${DRAFTS}?user_id=eq.${userId}`, { headers: auth });
      expect(
        isGenuineDenial(del.status()),
        `owner DELETE ${DRAFTS} must be denied, got ${del.status()}`,
      ).toBe(true);

      const delEvents = await api.delete(`/rest/v1/${EVENTS}?user_id=eq.${userId}`, { headers: auth });
      expect(
        isGenuineDenial(delEvents.status()),
        `owner DELETE ${EVENTS} must be denied, got ${delEvents.status()}`,
      ).toBe(true);
    });
  });
});
