import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveApplicationMetrics,
  type EnterpriseApplicationRow,
} from '../app/frontend/src/lib/enterpriseMetrics';

/**
 * PB-ENTERPRISE-TABLE-CONSTANTS-001 — Enterprise Dashboard query integrity.
 *
 * The page queried four table names that do not exist as TABLES keys, so at runtime they
 * were `supabase.from(undefined)`. The first of them checks its error and throws, which
 * means the whole dashboard failed to load — not one empty section.
 *
 * Repaired here, plus three defects the rename alone would have left in place:
 *
 *  D5  "Total Candidates" used `count: 'exact'`, counting application rows rather than
 *      distinct workers, while the KPI label promises candidates.
 *  D6  Downstream queries always built `.in('job_id', [])` for a company with no jobs,
 *      leaving a legitimate empty state at the mercy of how PostgREST serialises an
 *      empty IN.
 *  D7  The hires query filtered on `updated_at`, which does not exist on
 *      app_14da0f1941_job_applications. Verified against production.
 *
 * Status vocabulary is deliberately NOT asserted here: production carries
 * applied/cancelled/rejected while the funnel counts shortlisted/interviewed/offered/hired.
 * Reconciling them is PB-ENTERPRISE-STATUS-VOCABULARY-001. Pinning an equivalence in a
 * test would freeze an invented semantic.
 *
 * These tests are pure: no browser, no network, no deployed environment.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

/**
 * Same source with comments removed. Negative assertions run against this so that
 * documentation is free to name the identifiers the code must not use.
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const DASHBOARD = 'app/frontend/src/pages/EnterpriseDashboard.tsx';
const METRICS = 'app/frontend/src/lib/enterpriseMetrics.ts';

/**
 * TABLES is read as source rather than imported: lib/supabase.ts touches
 * `import.meta.env` at module scope, which is not available to this runner.
 */
const TABLES_SOURCE = read('app/frontend/src/lib/supabase.ts');
const tableKeyExists = (key: string) => new RegExp(`^\\s+${key}:`, 'm').test(TABLES_SOURCE);
const tableValue = (key: string) =>
  TABLES_SOURCE.match(new RegExp(`^\\s+${key}:\\s*'([^']+)'`, 'm'))?.[1];

/** Columns verified to exist on app_14da0f1941_job_applications in production. */
const APPLICATION_COLUMNS = new Set([
  'id',
  'created_at',
  'user_id',
  'job_title',
  'company_name',
  'location',
  'contract_type',
  'status',
  'job_id',
  'company_user_id',
  'previous_status',
  'cancelled_at',
  'cancellation_reason',
]);

const row = (
  id: string,
  user_id: string | null,
  status: string
): EnterpriseApplicationRow => ({ id, user_id, status });

test.describe('table constants — the four defective keys', () => {
  test('every TABLES key referenced by the dashboard actually exists', () => {
    const source = readCode(DASHBOARD);
    const keys = [...source.matchAll(/TABLES\.(\w+)/g)].map((m) => m[1]);

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(
        tableKeyExists(key),
        `TABLES.${key} does not exist — supabase.from(undefined) at runtime`
      ).toBe(true);
    }
  });

  test('workforce requests use the canonical constant', () => {
    const source = readCode(DASHBOARD);

    expect(source).toContain('TABLES.workforceRequests');
    // The defective key. Reintroducing it must fail this suite.
    expect(source).not.toContain('TABLES.companyWorkforceRequests');
    expect(tableKeyExists('companyWorkforceRequests')).toBe(false);
    expect(tableValue('workforceRequests')).toBe('app_14da0f1941_workforce_requests');
  });

  test('applications use the canonical constant', () => {
    const source = readCode(DASHBOARD);

    expect(source).toContain('TABLES.jobApplications');
    expect(source).not.toMatch(/TABLES\.applications\b/);
    expect(tableKeyExists('applications')).toBe(false);
    expect(tableValue('jobApplications')).toBe('app_14da0f1941_job_applications');
  });

  test('the four defective keys are gone from the source', () => {
    const source = readCode(DASHBOARD);
    const occurrences = [...source.matchAll(/TABLES\.(companyWorkforceRequests|applications)\b/g)];

    expect(
      occurrences.map((m) => m[0]),
      'the four TS2551 owned by this ticket must be gone'
    ).toEqual([]);
  });
});

test.describe('column integrity — only columns that exist in production', () => {
  test('the application fetch projects real columns', () => {
    const source = readCode(DASHBOARD);
    const select = source.match(/from\(TABLES\.jobApplications\)\s*\.select\('([^']+)'/);

    expect(select, 'application select not found').not.toBeNull();
    const projected = select![1].split(',').map((c) => c.trim());

    expect(projected).toContain('user_id');
    for (const column of projected) {
      expect(
        APPLICATION_COLUMNS.has(column),
        `${column} is not a column of app_14da0f1941_job_applications`
      ).toBe(true);
    }
  });

  test('applicant_id is not consumed anywhere', () => {
    // It does not exist; the real candidate column is user_id.
    expect(readCode(DASHBOARD)).not.toContain('applicant_id');
  });

  test('the dashboard does not filter applications on updated_at', () => {
    // D7: app_14da0f1941_job_applications has no updated_at column.
    const source = readCode(DASHBOARD);

    expect(source).not.toContain('updated_at');
    expect(APPLICATION_COLUMNS.has('updated_at')).toBe(false);
  });
});

test.describe('D5 — Total Candidates counts distinct workers', () => {
  test('three applications from two users count as two candidates', () => {
    const rows = [
      row('a1', 'user-1', 'applied'),
      row('a2', 'user-1', 'rejected'),
      row('a3', 'user-2', 'applied'),
    ];

    const { distinctCandidates, funnel } = deriveApplicationMetrics(rows);

    expect(distinctCandidates).toBe(2);
    // The application count still reflects all three rows.
    expect(funnel.applications).toBe(3);
  });

  test('one worker applying to many jobs is still one candidate', () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(`a${i}`, 'user-1', 'applied'));

    expect(deriveApplicationMetrics(rows).distinctCandidates).toBe(1);
  });

  test('rows without a user_id do not collapse into a phantom candidate', () => {
    const rows = [
      row('a1', null, 'applied'),
      row('a2', null, 'applied'),
      row('a3', 'user-1', 'applied'),
    ];

    expect(deriveApplicationMetrics(rows).distinctCandidates).toBe(1);
  });

  test('no separate count query survives', () => {
    const source = readCode(DASHBOARD);

    // The distinct count is derived from the dataset already fetched.
    expect(source).not.toContain("count: 'exact'");
    expect(source).not.toContain('head: true');
    expect(source).toContain('deriveApplicationMetrics');
  });

  test('exactly three Supabase queries remain, each with its error checked', () => {
    const source = readCode(DASHBOARD);
    const froms = [...source.matchAll(/\.from\(TABLES\.\w+\)/g)];

    expect(froms.length, 'five queries were reduced to three; two were broken').toBe(3);

    for (const guard of ['if (jobsError) throw jobsError', 'if (wfError) throw wfError', 'if (appsError) throw appsError']) {
      expect(source, `missing error guard: ${guard}`).toContain(guard);
    }
  });
});

test.describe('D6 — a company with zero jobs is a legitimate empty state', () => {
  test('an empty dataset yields zeros, not an error', () => {
    const { funnel, distinctCandidates, hires } = deriveApplicationMetrics([]);

    expect(distinctCandidates).toBe(0);
    expect(hires).toBe(0);
    expect(funnel).toEqual({
      applications: 0,
      shortlisted: 0,
      interviewed: 0,
      offered: 0,
      hired: 0,
    });
  });

  test('downstream queries are skipped when there are no jobs', () => {
    const source = readCode(DASHBOARD);

    // The job-id set is computed once and guarded before it reaches PostgREST.
    expect(source).toMatch(/const jobIds = allJobs\.map/);
    expect(source).toMatch(/if \(jobIds\.length > 0\)/);

    // No query may inline an unguarded .in('job_id', allJobs.map(...)).
    expect(source).not.toMatch(/\.in\(\s*'job_id',\s*allJobs\.map/);
  });

  test('the empty state does not set a load error', () => {
    const source = readCode(DASHBOARD);
    const guardIndex = source.indexOf('if (jobIds.length > 0)');
    const block = source.slice(guardIndex, guardIndex + 600);

    expect(guardIndex).toBeGreaterThan(-1);
    // Nothing inside or immediately after the guard reports failure for an empty set.
    expect(block).not.toContain('setError');
  });
});

test.describe('query failures stay distinguishable from empty data', () => {
  test('every fetch destructures error and throws it', () => {
    const source = readCode(DASHBOARD);
    const destructurings = [...source.matchAll(/const \{ data: \w+, error: (\w+) \}/g)].map(
      (m) => m[1]
    );

    expect(destructurings.length).toBe(3);
    for (const name of destructurings) {
      expect(source, `${name} is never inspected`).toContain(`if (${name}) throw ${name}`);
    }
  });

  test('a thrown query error reaches setError, not a silent zero', () => {
    const source = readCode(DASHBOARD);

    expect(source).toContain('catch (err: unknown)');
    expect(source).toContain('setError(message)');
  });

  test('the hires metric cannot fail independently', () => {
    // D7 removed the separate hires query, so an application-fetch failure is the only
    // way hires can be wrong — and that failure throws.
    const source = readCode(DASHBOARD);

    expect(source).not.toMatch(/\.eq\('status',\s*'hired'\)/);
    expect(source).toContain('hires');
  });
});

test.describe('metrics actually reach the UI', () => {
  test('a non-empty dataset produces non-zero metrics', () => {
    const rows = [
      row('a1', 'user-1', 'applied'),
      row('a2', 'user-2', 'hired'),
      row('a3', 'user-3', 'shortlisted'),
      row('a4', 'user-1', 'cancelled'),
    ];

    const { funnel, distinctCandidates, hires } = deriveApplicationMetrics(rows);

    expect(funnel.applications).toBe(4);
    expect(distinctCandidates).toBe(3);
    expect(funnel.shortlisted).toBe(1);
    expect(hires).toBe(1);
  });

  test('derived values are wired into the rendered state', () => {
    const source = readCode(DASHBOARD);

    expect(source).toContain('totalCandidates: distinctCandidates');
    expect(source).toContain('hires,');
    expect(source).toContain('value={metrics.totalCandidates}');
    expect(source).toContain('value={metrics.hires}');
  });

  test('the hires KPI is not labelled as monthly', () => {
    // The month window is not derivable from the schema, so the label states what is
    // actually counted. See PB-ENTERPRISE-STATUS-VOCABULARY-001.
    const source = read(DASHBOARD);

    expect(source).not.toContain('Hires This Month');
    expect(source).toContain('label="Hires"');
  });
});

test.describe('status vocabulary is left untouched', () => {
  test('the metrics module invents no status equivalence', () => {
    const source = readCode(METRICS);

    // Production workforce requests carry `new`; mapping it to `open` would be invented.
    expect(source).not.toMatch(/['"]new['"]\s*(?:=>|:|\?)/);
    expect(source).not.toContain('draft');
    expect(source).not.toContain('fulfilled');
  });

  test('the workforce pipeline still reads raw statuses', () => {
    const source = readCode(DASHBOARD);

    // Unchanged by this ticket: repairing the query must not silently redefine the funnel.
    for (const status of ['draft', 'open', 'in_progress', 'fulfilled', 'cancelled']) {
      expect(source).toContain(`w.status === '${status}'`);
    }
  });
});
