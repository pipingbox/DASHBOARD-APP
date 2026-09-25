import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * TS ↔ SQL parity test — keeps app/frontend/src/lib/workforceReadiness.ts and
 * the workforce funnel SQL (view + baseline query) from diverging.
 *
 * PB-WORKFORCE-ACTIVATION / WFA-007 (D18 condition 3).
 * The TypeScript library is the canonical source; the SQL files must
 * replicate its predicates VERBATIM. If either side changes without the
 * other, this test fails.
 */

import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_SPECIFIED,
} from '../app/frontend/src/lib/workforceReadiness';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const viewSql = readFileSync(`${repoRoot}sql/008-workforce-funnel-view.sql`, 'utf8');
const baselineSql = readFileSync(
  `${repoRoot}sql/009-workforce-funnel-baseline-query.sql`,
  'utf8',
);

function availabilityInList(sql: string): string[] {
  const m = sql.match(/availability_status IN \(([^)]*)\)/);
  expect(m, 'SQL must contain an availability_status IN (...) list').toBeTruthy();
  return m![1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
    .sort();
}

test.describe('TS ↔ SQL parity — availability literals', () => {
  test('view availability IN list matches AVAILABILITY_AVAILABLE exactly', () => {
    const sqlList = availabilityInList(viewSql);
    const tsList = [...AVAILABILITY_AVAILABLE].slice().sort();
    expect(sqlList).toEqual(tsList);
  });
  test('baseline availability IN list matches AVAILABILITY_AVAILABLE exactly', () => {
    const sqlList = availabilityInList(baselineSql);
    const tsList = [...AVAILABILITY_AVAILABLE].slice().sort();
    expect(sqlList).toEqual(tsList);
  });
  test("every AVAILABILITY_SPECIFIED value except not_currently_available is AVAILABLE in SQL", () => {
    // The four specified values: three AVAILABLE + not_currently_available.
    // The SQL view excludes not_currently_available from MATCHABLE via the
    // IN list; workforce_ready must additionally exclude not_specified.
    for (const v of AVAILABILITY_SPECIFIED) {
      if (v === 'not_currently_available') continue;
      expect(availabilityInList(viewSql)).toContain(v);
    }
  });
});

test.describe('TS ↔ SQL parity — cohort rule (D14)', () => {
  test("view funnels restrict cohort to role = 'worker'", () => {
    // One FILTER per metric: canonical, complete, workforce_ready, matchable,
    // credential_evidence, credential_verified.
    const occurrences = viewSql.match(/p\.role = 'worker'/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(6);
  });
  test("baseline query restricts cohort to role = 'worker'", () => {
    expect(baselineSql).toContain("WHERE p.role = 'worker'");
  });
  test("SQL never treats role='user' as workforce cohort", () => {
    expect(viewSql).not.toContain("role = 'user'");
    expect(baselineSql).not.toContain("role = 'user'");
  });
});

test.describe('TS ↔ SQL parity — structured experience rule', () => {
  test('qualifying_experience_count >= 1 required in workforce_ready AND matchable', () => {
    const wr = viewSql.indexOf(') AS workforce_ready');
    const mb = viewSql.indexOf(') AS matchable');
    const complete = viewSql.indexOf(') AS complete');
    const wrBlock = viewSql.slice(complete, wr);
    const mbBlock = viewSql.slice(wr, mb);
    expect(wrBlock).toMatch(/qualifying_experience_count.*>=\s*1/);
    expect(mbBlock).toMatch(/qualifying_experience_count.*>=\s*1/);
  });
  test('COMPLETE does NOT require structured experience (years_experience only as summary)', () => {
    const start = viewSql.indexOf('count(*) FILTER');
    const complete = viewSql.indexOf(') AS complete');
    const completeBlock = viewSql.slice(start, complete);
    expect(completeBlock).not.toMatch(/qualifying_experience_count/);
    expect(completeBlock).toMatch(/years_experience IS NOT NULL/);
  });
  test('baseline query applies the same experience rules', () => {
    const wr = baselineSql.indexOf(') AS workforce_ready');
    const mb = baselineSql.indexOf(') AS matchable');
    const complete = baselineSql.indexOf(') AS complete');
    expect(baselineSql.slice(complete, wr)).toMatch(/qualifying_experience_count.*>=\s*1/);
    expect(baselineSql.slice(wr, mb)).toMatch(/qualifying_experience_count.*>=\s*1/);
  });
});

test.describe('TS ↔ SQL parity — QUALIFYING EXPERIENCE predicate (WFA-001)', () => {
  // The SQL counts subquery must filter rows exactly like
  // isQualifyingExperience(): position AND company_name non-empty (btrim).
  const qualifyingFilter =
    /e\.position IS NOT NULL AND btrim\(e\.position\) <> ''\s*\n?\s*AND e\.company_name IS NOT NULL AND btrim\(e\.company_name\) <> ''/;

  test('view counts only qualifying experience rows', () => {
    expect(viewSql).toMatch(qualifyingFilter);
    expect(viewSql).not.toMatch(/\) AS experience_count/);
  });
  test('baseline query counts only qualifying experience rows in both CTEs', () => {
    const matches = baselineSql.match(
      /AS qualifying_experience_count/g,
    );
    expect(matches?.length).toBeGreaterThanOrEqual(4); // 2 CTE subqueries + 2 projections
    expect(baselineSql).not.toMatch(/\) AS experience_count/);
    const filterMatches = baselineSql.match(
      /btrim\(e\.position\) <> ''/g,
    );
    expect(filterMatches?.length).toBe(2);
  });
  test('a bare/partial row (missing position or company_name) cannot satisfy the SQL predicate', () => {
    // Both SQL files must require BOTH fields; count(*) is inside the same
    // subquery as both conditions.
    for (const sql of [viewSql, baselineSql]) {
      const subqueries = sql.match(
        /SELECT count\(\*\) FROM app_worker_experiences e[\s\S]*?AS qualifying_experience_count/g,
      );
      expect(subqueries?.length).toBeGreaterThanOrEqual(1);
      for (const q of subqueries ?? []) {
        expect(q).toContain('e.position IS NOT NULL AND btrim(e.position) <> \'\'');
        expect(q).toContain('e.company_name IS NOT NULL AND btrim(e.company_name) <> \'\'');
      }
    }
  });
});

test.describe('TS ↔ SQL parity — UNKNOWN availability rule', () => {
  test("workforce_ready excludes 'not_specified' (UNKNOWN, not false)", () => {
    const wr = viewSql.indexOf(') AS workforce_ready');
    const complete = viewSql.indexOf(') AS complete');
    const wrBlock = viewSql.slice(complete, wr);
    expect(wrBlock).toContain("availability_status <> 'not_specified'");
    expect(wrBlock).toMatch(/availability_status IS NOT NULL/);
  });
});

test.describe('TS ↔ SQL parity — COMPLETE field list replicated verbatim', () => {
  test('core COMPLETE conditions appear in all three maturity filters of the view', () => {
    // btrim(title) must appear in complete, workforce_ready and matchable.
    const occurrences = viewSql.match(/btrim\(p\.title\)/g) ?? [];
    expect(occurrences.length).toBe(3);
    const bioOccurrences = viewSql.match(/length\(btrim\(p\.bio\)\) > 10/g) ?? [];
    expect(bioOccurrences.length).toBe(3);
  });
  test('baseline query replicates the same field list three times', () => {
    const occurrences = baselineSql.match(/btrim\(title\)/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
    const bioOccurrences = baselineSql.match(/length\(btrim\(bio\)\) > 10/g) ?? [];
    expect(bioOccurrences.length).toBeGreaterThanOrEqual(3);
  });
});
