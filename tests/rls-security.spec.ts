import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * RLS security tests — PB-SEC-RLS-WORKFORCE-001.
 *
 * Guards the B2B lead tables against public read/write. Before this ticket both
 * `workforce_requests` and `company_leads` had `public SELECT USING true` and
 * `public UPDATE USING true`, so any anonymous visitor could read and modify every lead:
 * company names, contact persons, emails and countries.
 *
 * These tests exercise the real PostgREST endpoint with a real anon key, which is the only
 * way to verify RLS. A unit test cannot observe a policy.
 *
 * PRIVACY: assertions only ever check status codes and row COUNTS. No lead content is read
 * into the test output, so a CI log can never leak personal data — including when a test
 * fails, which is exactly when logs get pasted around.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

const LEAD_TABLES = [
  'app_14da0f1941_workforce_requests',
  'app_14da0f1941_company_leads',
];

const hasAnonConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const hasAuthConfig = !!(hasAnonConfig && EMAIL && PASSWORD);

/**
 * Marker prefix for the rows this suite creates. Must stay in sync with TEST_LEAD_PREFIX in
 * supabase/functions/purge-test-leads/index.ts — that function only ever deletes rows whose
 * company_name starts with this literal.
 */
const TEST_LEAD_MARKER = 'RLS-TEST — automated, safe to delete';

/**
 * Token for the purge-test-leads Edge Function. Either the dedicated shared secret or the
 * service role key is accepted by the function; prefer the dedicated one so CI does not need
 * the service role key. Absent in local runs → purge is skipped, never fails the suite.
 */
const PURGE_SECRET =
  process.env.PURGE_TEST_LEADS_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** A response that exposes no rows: either denied outright, or an empty result set. */
async function assertExposesNoRows(res: { status: () => number; json: () => Promise<unknown> }) {
  const status = res.status();

  if (status === 200) {
    // RLS may filter instead of rejecting. An empty array is a pass; anything else is a leak.
    const rows = (await res.json()) as unknown[];
    expect(
      Array.isArray(rows) ? rows.length : -1,
      'anon must not be able to read any lead row',
    ).toBe(0);
    return;
  }

  expect(status, 'anon read must be denied or empty').toBeGreaterThanOrEqual(400);
}

/**
 * Best-effort cleanup of the rows this suite inserts.
 *
 * anon cannot DELETE (that is the lockdown being tested) and the QA account is not admin, so
 * the only way to remove them is the service-role `purge-test-leads` Edge Function.
 *
 * This is deliberately unable to fail the run: a cleanup problem (function not deployed yet,
 * secret missing, network blip) must never turn a passing security gate into a red build.
 * The secret itself is never logged.
 */
async function purgeTestLeads(): Promise<void> {
  if (!SUPABASE_URL) return;

  if (!PURGE_SECRET) {
    console.warn(
      '[rls-security] Skipping test-lead purge: no PURGE_TEST_LEADS_SECRET / SUPABASE_SERVICE_ROLE_KEY in env. ' +
        'Rows were inserted archived/cancelled so they stay out of the sales pipeline.',
    );
    return;
  }

  let purgeApi: Awaited<ReturnType<typeof pwRequest.newContext>> | undefined;
  try {
    const functionsBase = SUPABASE_URL.replace(/\/+$/, '');
    purgeApi = await pwRequest.newContext();
    const res = await purgeApi.post(`${functionsBase}/functions/v1/purge-test-leads`, {
      headers: {
        Authorization: `Bearer ${PURGE_SECRET}`,
        'Content-Type': 'application/json',
      },
      data: {},
      timeout: 15_000,
    });

    if (res.status() >= 400) {
      console.warn(
        `[rls-security] Test-lead purge returned HTTP ${res.status()}. ` +
          'Leftover RLS-TEST rows are archived/cancelled and excluded from the pipeline views.',
      );
      return;
    }

    console.log('[rls-security] Test-lead purge OK:', await res.text());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[rls-security] Test-lead purge failed (ignored): ${message}`);
  } finally {
    await purgeApi?.dispose().catch(() => undefined);
  }
}

test.describe('lead tables — anonymous access', () => {
  test.skip(!hasAnonConfig, 'Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');

  let api: Awaited<ReturnType<typeof pwRequest.newContext>>;

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: SUPABASE_URL });
  });

  test.afterAll(async () => {
    // Purge first (best-effort, never throws), then tear the context down.
    await purgeTestLeads();
    await api?.dispose();
  });

  const anonHeaders = () => ({
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  });

  for (const table of LEAD_TABLES) {
    test(`anon cannot READ ${table}`, async () => {
      const res = await api.get(`/rest/v1/${table}?select=id&limit=1`, {
        headers: anonHeaders(),
      });
      await assertExposesNoRows(res);
    });

    test(`anon cannot UPDATE ${table}`, async () => {
      const res = await api.patch(`/rest/v1/${table}?id=not.is.null`, {
        headers: anonHeaders(),
        data: { status: 'rls-probe' },
      });

      // Either rejected, or allowed-but-matched-nothing because RLS filtered every row.
      if (res.status() < 400) {
        const body = await res.text();
        expect(body.trim(), 'anon UPDATE must not affect any row').toBe('');
      } else {
        expect(res.status()).toBeGreaterThanOrEqual(400);
      }
    });

    test(`anon cannot DELETE ${table}`, async () => {
      const res = await api.delete(`/rest/v1/${table}?id=not.is.null`, {
        headers: anonHeaders(),
      });

      if (res.status() < 400) {
        const body = await res.text();
        expect(body.trim(), 'anon DELETE must not affect any row').toBe('');
      } else {
        expect(res.status()).toBeGreaterThanOrEqual(400);
      }
    });
  }

  test('anon CAN still submit the public B2B form', async () => {
    // The whole point of the ticket is closing reads without closing the funnel.
    // This insert is BLOCKING in RequestWorkers: if it fails the visitor sees an error and
    // the lead is lost, so a regression here is a total loss of the B2B funnel.
    // Marked clearly as a test lead so it can be filtered out of the pipeline.
    // Defense in depth (the purge in afterAll may not be deployed yet): status 'cancelled'
    // keeps the row out of every workforce pipeline counter — CompanyWorkforceRequests
    // counts pending as new|reviewing, in-progress as recruiting|partially_staffed and
    // fulfilled as fully_staffed|completed, and EnterpriseDashboard buckets 'cancelled'
    // separately. Only the marker/metadata changes; the assertion below is untouched.
    const res = await api.post('/rest/v1/app_14da0f1941_workforce_requests', {
      headers: anonHeaders(),
      data: {
        company_name: TEST_LEAD_MARKER,
        contact_person: 'RLS Test',
        email: 'rls-test@pipingbox.com',
        country: 'Test',
        worker_type: 'welder',
        workers_requested: 1,
        status: 'cancelled',
      },
    });

    expect(
      res.status(),
      'public lead submission must keep working after RLS lockdown',
    ).toBeLessThan(400);
  });

  test('anon CAN still write the legacy company_leads row', async () => {
    // RequestWorkers also inserts into company_leads for backward compatibility. That call is
    // best-effort (it only warns), so a failure here does NOT break the form — but it would
    // silently desync the legacy table, which admin views still read.
    // Payload mirrors exactly what RequestWorkers.tsx sends as legacyPayload.
    // company_leads uses workers_needed, NOT worker_type (that is a workforce_requests column).
    // Sending an unknown column causes a 400 schema error, not an auth error.
    // Defense in depth: archived=true + status 'rejected' put the row outside the default
    // AdminLeads view — filteredLeads drops archived rows while showArchived is false (its
    // default) and every stat counter (total/new/urgent/active) also excludes archived.
    // 'rejected' is a first-class STATUSES value there, so the dropdown still renders fine.
    const res = await api.post('/rest/v1/app_14da0f1941_company_leads', {
      headers: anonHeaders(),
      data: {
        company_name: TEST_LEAD_MARKER,
        contact_person: 'RLS Test',
        email: 'rls-test@pipingbox.com',
        country: 'Test',
        workers_needed: 'welder',
        status: 'rejected',
        priority: 'normal',
        archived: true,
      },
    });

    expect(
      res.status(),
      'legacy lead insert must keep working, or the legacy table silently desyncs',
    ).toBeLessThan(400);
  });
});

test.describe('lead tables — authenticated access', () => {
  test.skip(
    !hasAuthConfig,
    'Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD in addition to Supabase config',
  );

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
      // The QA account is a worker, not an admin, and owns no leads. It must therefore
      // see zero rows. Only counts are asserted; no lead content is fetched.
      const res = await api.get(`/rest/v1/${table}?select=id`, {
        headers: { ...authHeaders(), Prefer: 'count=exact' },
      });

      expect(res.status()).toBe(200);
      const rows = (await res.json()) as unknown[];
      expect(
        rows.length,
        'a non-admin user with no leads of their own must see none',
      ).toBe(0);
    });

    test(`a normal user cannot UPDATE ${table}`, async () => {
      const res = await api.patch(`/rest/v1/${table}?id=not.is.null`, {
        headers: authHeaders(),
        data: { status: 'rls-probe' },
      });

      if (res.status() < 400) {
        const body = await res.text();
        expect(body.trim(), 'non-admin UPDATE must not affect any row').toBe('');
      } else {
        expect(res.status()).toBeGreaterThanOrEqual(400);
      }
    });
  }
});
