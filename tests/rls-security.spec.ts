import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * RLS security tests — PB-SEC-RLS-WORKFORCE-001 (corrected v2, Stream A / GO 2026-09-26).
 *
 * Guards the B2B lead tables against public read/write. v2 fixes the defects the
 * PO flagged AND the PostgREST semantics mistakes found in run 36222667243:
 *   - v1 used `id=not.is.null` destructive probes → now every probe targets
 *     `company_name=eq.<this run's unique marker>` (exact fixtures of THIS run);
 *   - v1 treated an empty/204 body as "zero rows affected" → now the affected
 *     count comes from the `Content-Range` response header (Prefer: count=exact),
 *     which is the only precise PostgREST signal for writes without RETURNING;
 *   - v1 accepted any HTTP >=400 (incl. 400 bad-payload, 404, 5xx) as "blocked" →
 *     now only a genuine 401/403 counts as denial; anything else fails loudly;
 *   - v2 correction: INSERT/UPDATE probes do NOT use Prefer:return=representation
 *     on principals without SELECT privilege — PostgREST answers 401/400 for the
 *     RETURNING clause, which says nothing about the write privilege itself;
 *   - positive controls prove the public funnel still works (anon INSERT) and a
 *     non-admin cannot see anything;
 *   - cleanup removes only this run's marker rows (purge-test-leads matches the
 *     marker prefix); a failed/unavailable cleanup is reported explicitly as
 *     PENDING, never silently swallowed.
 *
 * PRIVACY: assertions only ever check status codes and row COUNTS. No lead
 * content is read into the test output.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

const LEAD_TABLES = [
  'app_14da0f1941_workforce_requests',
  'app_14da0f1941_company_leads',
] as const;

const hasAnonConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasAuthConfig = !!(hasAnonConfig && EMAIL && PASSWORD);

/**
 * Marker prefix — must stay in sync with TEST_LEAD_PREFIX in
 * supabase/functions/purge-test-leads/index.ts: that function only ever deletes
 * rows whose company_name starts with this literal. Fixtures use
 * `${MARKER} #${RUN_ID}` so probes match exactly this run's rows and the purge
 * function still recognizes them.
 */
const TEST_LEAD_MARKER = 'RLS-TEST — automated, safe to delete';
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const RUN_MARKER = `${TEST_LEAD_MARKER} #${RUN_ID}`;

/** Token for the purge-test-leads Edge Function (cleanup of anon-inserted rows). */
const PURGE_SECRET =
  process.env.PURGE_TEST_LEADS_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Tables this run actually inserted into (drives the PENDING report). */
const touchedTables = new Set<string>();
let purgeAttempted = false;
let purgeSucceeded = false;

const anonHeaders = () => ({
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
});

/** A genuine RLS denial is 401/403. 400/404/5xx are NOT proof of policy. */
const isGenuineDenial = (status: number) => status === 401 || status === 403;

/**
 * Exact affected-row count from PostgREST's Content-Range header
 * ("*​/0" for empty-range writes, "0-0/N" for ranged ones). Returns -1 when the
 * header is missing — callers must treat that as UNVERIFIABLE, not as zero.
 */
function affectedCount(res: { headers: () => Record<string, string> }): number {
  const range = res.headers()['content-range'] ?? '';
  const match = range.match(/\/(\d+)\s*$/);
  return match ? Number(match[1]) : -1;
}

async function assertReadExposesNoRows(
  res: { status: () => number; json: () => Promise<unknown> },
  what: string,
) {
  const status = res.status();
  if (isGenuineDenial(status)) return;
  if (status === 200) {
    const rows = (await res.json()) as unknown[];
    expect(Array.isArray(rows) ? rows.length : -1, `${what}: read must be denied or return zero rows`).toBe(0);
    return;
  }
  throw new Error(`${what}: unexpected status ${status} (not a genuine 401/403 denial nor an empty 200)`);
}

/**
 * Forbidden-write probe against THIS RUN's marker rows only.
 * Pass: genuine 401/403 denial, OR a 2xx whose Content-Range proves 0 affected.
 * Fail: any other status, a missing Content-Range (unverifiable), or N>0.
 */
async function assertForbiddenWrite(
  res: { status: () => number; headers: () => Record<string, string> },
  what: string,
) {
  const status = res.status();
  if (isGenuineDenial(status)) return;
  if (status >= 200 && status < 300) {
    const n = affectedCount(res);
    expect(n, `${what}: 2xx without a verifiable Content-Range count is NOT a pass`).toBe(0);
    return;
  }
  throw new Error(`${what}: unexpected status ${status} (not a genuine 401/403 denial nor a zero-affect 2xx)`);
}

test.describe('lead tables — anonymous access (safe, fixture-scoped)', () => {
  test.skip(!hasAnonConfig, 'Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');

  let api: Awaited<ReturnType<typeof pwRequest.newContext>>;

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  });

  test.afterAll(async () => {
    await purgeThisRunsLeads();
    if (touchedTables.size > 0 && (!purgeAttempted || !purgeSucceeded)) {
      console.warn(
        `[rls-security] PENDING CLEANUP — rows with company_name starting "${TEST_LEAD_MARKER}" ` +
          `(run ${RUN_ID}) remain in: ${[...touchedTables].join(', ')}. ` +
          (purgeAttempted
            ? 'purge-test-leads was called but did not confirm success.'
            : 'purge-test-leads was NOT callable (no PURGE_TEST_LEADS_SECRET).') +
          ' Rows are archived/cancelled and excluded from the pipeline views, but they MUST be removed.',
      );
    }
    await api?.dispose();
  });

  test('POSITIVE CONTROL: anon CAN submit the public B2B form (fixture source)', async () => {
    // No Prefer:return=representation: anon has INSERT but not SELECT, and the
    // RETURNING clause would produce a misleading 401. A bare 201 is the exact
    // signal that the public funnel still works after the RLS lockdown.
    const res = await api.post('/rest/v1/app_14da0f1941_workforce_requests', {
      headers: anonHeaders(),
      data: {
        company_name: RUN_MARKER,
        contact_person: 'RLS Test',
        email: 'rls-test@pipingbox.com',
        country: 'Test',
        worker_type: 'welder',
        workers_requested: 1,
        status: 'cancelled',
      },
    });
    expect(res.status(), 'public lead submission must keep working after RLS lockdown').toBeLessThan(400);
    touchedTables.add('app_14da0f1941_workforce_requests');
  });

  test('POSITIVE CONTROL: anon CAN still write the legacy company_leads row', async () => {
    const res = await api.post('/rest/v1/app_14da0f1941_company_leads', {
      headers: anonHeaders(),
      data: {
        company_name: RUN_MARKER,
        contact_person: 'RLS Test',
        email: 'rls-test@pipingbox.com',
        country: 'Test',
        workers_needed: 'welder',
        status: 'rejected',
        priority: 'normal',
        archived: true,
      },
    });
    expect(res.status(), 'legacy lead insert must keep working, or the legacy table silently desyncs').toBeLessThan(400);
    touchedTables.add('app_14da0f1941_company_leads');
  });

  for (const table of LEAD_TABLES) {
    test(`anon cannot READ ${table}`, async () => {
      const res = await api.get(`/rest/v1/${table}?select=id&limit=1`, { headers: anonHeaders() });
      await assertReadExposesNoRows(res, `anon READ ${table}`);
    });

    test(`anon UPDATE affects zero rows in ${table} (this run's marker, verified)`, async () => {
      const res = await api.patch(`/rest/v1/${table}?company_name=eq.${encodeURIComponent(RUN_MARKER)}`, {
        headers: { ...anonHeaders(), Prefer: 'count=exact' },
        data: { status: 'rls-probe-should-not-stick' },
      });
      await assertForbiddenWrite(res, `anon UPDATE ${table}`);
    });

    test(`anon DELETE affects zero rows in ${table} (this run's marker, verified)`, async () => {
      const res = await api.delete(`/rest/v1/${table}?company_name=eq.${encodeURIComponent(RUN_MARKER)}`, {
        headers: { ...anonHeaders(), Prefer: 'count=exact' },
      });
      await assertForbiddenWrite(res, `anon DELETE ${table}`);
    });
  }
});

test.describe('lead tables — authenticated non-admin access (safe)', () => {
  test.skip(!hasAuthConfig, 'Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD in addition to Supabase config');

  let api: Awaited<ReturnType<typeof pwRequest.newContext>>;
  let accessToken = '';

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
    const res = await api.post('/auth/v1/token?grant_type=password', {
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(res.status(), 'QA account must authenticate').toBe(200);
    accessToken = (await res.json()).access_token;
    expect(accessToken).toBeTruthy();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  const authHeaders = () => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  });

  for (const table of LEAD_TABLES) {
    test(`a normal user cannot read other companies' leads in ${table}`, async () => {
      const res = await api.get(`/rest/v1/${table}?select=id`, {
        headers: { ...authHeaders(), Prefer: 'count=exact' },
      });
      expect(res.status()).toBe(200);
      const rows = (await res.json()) as unknown[];
      expect(rows.length, 'a non-admin user with no leads must see none').toBe(0);
    });

    test(`a normal user cannot UPDATE ${table} (this run's marker, verified)`, async () => {
      const res = await api.patch(`/rest/v1/${table}?company_name=eq.${encodeURIComponent(RUN_MARKER)}`, {
        headers: { ...authHeaders(), Prefer: 'count=exact' },
        data: { status: 'rls-probe-should-not-stick' },
      });
      await assertForbiddenWrite(res, `non-admin UPDATE ${table}`);
    });

    test(`a normal user cannot DELETE from ${table} (this run's marker, verified)`, async () => {
      const res = await api.delete(`/rest/v1/${table}?company_name=eq.${encodeURIComponent(RUN_MARKER)}`, {
        headers: { ...authHeaders(), Prefer: 'count=exact' },
      });
      await assertForbiddenWrite(res, `non-admin DELETE ${table}`);
    });
  }
});

/** Cleanup of this run's marker rows via the service-role purge function. */
async function purgeThisRunsLeads(): Promise<void> {
  if (!SUPABASE_URL || !PURGE_SECRET || touchedTables.size === 0) return;
  purgeAttempted = true;
  let purgeApi: Awaited<ReturnType<typeof pwRequest.newContext>> | undefined;
  try {
    const functionsBase = SUPABASE_URL.replace(/\/+$/, '');
    purgeApi = await pwRequest.newContext();
    const res = await purgeApi.post(`${functionsBase}/functions/v1/purge-test-leads`, {
      headers: { Authorization: `Bearer ${PURGE_SECRET}`, 'Content-Type': 'application/json' },
      data: {},
      timeout: 15_000,
    });
    purgeSucceeded = res.status() < 400;
    if (!purgeSucceeded) {
      console.warn(`[rls-security] purge-test-leads returned HTTP ${res.status()} — see PENDING report.`);
    }
  } catch (err) {
    console.warn(`[rls-security] purge-test-leads failed (see PENDING report): ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await purgeApi?.dispose().catch(() => undefined);
  }
}
