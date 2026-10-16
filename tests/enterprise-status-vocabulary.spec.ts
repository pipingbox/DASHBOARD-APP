import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveApplicationMetrics,
  funnelAccountsForAllApplications,
  type EnterpriseApplicationRow,
} from '../app/frontend/src/lib/enterpriseMetrics';

/**
 * PB-COMPANY-MVP-PHASE-0-001 — Security and Truth Gate.
 *
 * This suite pins the STATUS-VOCABULARY and COUNT-INTEGRITY fixes:
 *
 *  1. The hiring funnel counts the canonical vocabulary of
 *     `app_update_application_status` (sql/034). The previous tokens
 *     `interviewed` and `offered` matched no row that can ever exist, so four
 *     funnel bars were zero by construction (PB-ENTERPRISE-STATUS-VOCABULARY-001).
 *  2. Every application row lands in exactly one bucket: the buckets reconcile
 *     with the total, structurally.
 *  3. The workforce pipeline uses the company-facing projection from
 *     workforce-admin (NEW/IN_PROGRESS/COMPLETED/ON_HOLD/CANCELLED), not the
 *     draft/open/fulfilled tokens that never existed in production data.
 *  4. Dashboard counts derive from real job_applications rows, not from the
 *     unmaintained jobs.applications_count (until sql/040 ships its trigger).
 *  5. The pricing page no longer promises unverified capabilities.
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
const COMPANY_DASHBOARD = 'app/frontend/src/pages/CompanyDashboard.tsx';
const METRICS = 'app/frontend/src/lib/enterpriseMetrics.ts';
const PRICING = 'app/frontend/src/pages/PricingPage.tsx';
const COUNT_SQL = 'sql/040-pb-application-count-integrity.sql';

const row = (
  id: string,
  user_id: string | null,
  status: string
): EnterpriseApplicationRow => ({ id, user_id, status });

/* ─── 1. Canonical vocabulary funnel ─── */

test.describe('status vocabulary — canonical funnel', () => {
  test('every canonical sql/034 token gets its own bucket', () => {
    const rows = [
      row('1', 'u1', 'pending_profile_validation'),
      row('2', 'u1', 'applied'),
      row('3', 'u2', 'reviewed'),
      row('4', 'u2', 'shortlisted'),
      row('5', 'u3', 'sent_to_client'),
      row('6', 'u3', 'interview'),
      row('7', 'u4', 'hired'),
      row('8', 'u4', 'rejected'),
      row('9', 'u5', 'withdrawn'),
      row('10', 'u5', 'cancelled'), // legacy token, still in production data
      row('11', 'u6', 'SOME_FUTURE_TOKEN'), // unknown
    ];

    const { funnel, distinctCandidates, hires } = deriveApplicationMetrics(rows);

    expect(funnel.applications).toBe(11);
    expect(funnel.pendingProfileValidation).toBe(1);
    expect(funnel.qualified).toBe(1);
    expect(funnel.reviewed).toBe(1);
    expect(funnel.shortlisted).toBe(1);
    expect(funnel.sentToClient).toBe(1);
    expect(funnel.interview).toBe(1);
    expect(funnel.hired).toBe(1);
    expect(funnel.rejected).toBe(1);
    expect(funnel.withdrawn).toBe(1);
    expect(funnel.cancelled).toBe(1);
    expect(funnel.unknown).toBe(1);
    expect(hires).toBe(1);
    expect(distinctCandidates).toBe(6);
  });

  test('reconciliation holds: buckets sum to total, always', () => {
    const productionShape = [
      ...Array.from({ length: 44 }, (_, i) => row(`p${i}`, `u${i % 20}`, 'pending_profile_validation')),
      ...Array.from({ length: 27 }, (_, i) => row(`c${i}`, `u${i % 15}`, 'cancelled')),
      ...Array.from({ length: 6 }, (_, i) => row(`a${i}`, `u${i % 5}`, 'applied')),
    ];

    const { funnel } = deriveApplicationMetrics(productionShape);

    expect(funnel.applications).toBe(77);
    expect(funnel.pendingProfileValidation).toBe(44);
    expect(funnel.cancelled).toBe(27);
    expect(funnel.qualified).toBe(6);
    expect(funnelAccountsForAllApplications(funnel)).toBe(true);
  });

  test('reconciliation is exposed, not assumed: a funnel with a dropped bucket fails', () => {
    const { funnel } = deriveApplicationMetrics([
      row('1', 'u1', 'applied'),
      row('2', 'u2', 'hired'),
    ]);
    expect(funnelAccountsForAllApplications(funnel)).toBe(true);

    const broken = { ...funnel, hired: 0 };
    expect(funnelAccountsForAllApplications(broken)).toBe(false);
  });

  test('status comparison is case-insensitive and NULL-safe', () => {
    const { funnel } = deriveApplicationMetrics([
      row('1', 'u1', 'APPLIED'),
      row('2', 'u2', 'Hired'),
      { id: '3', user_id: 'u3', status: '' },
      { id: '4', user_id: null, status: undefined as unknown as string },
    ]);

    expect(funnel.qualified).toBe(1);
    expect(funnel.hired).toBe(1);
    expect(funnel.unknown).toBe(2); // '' and undefined are not canonical tokens
    expect(funnel.applications).toBe(4);
    expect(funnelAccountsForAllApplications(funnel)).toBe(true);
  });

  test('empty input is a legitimate all-zero funnel that still reconciles', () => {
    const { funnel } = deriveApplicationMetrics([]);
    expect(funnel.applications).toBe(0);
    expect(funnelAccountsForAllApplications(funnel)).toBe(true);
  });
});

/* ─── 2. Source-level bans: dead tokens must not come back ─── */

test.describe('status vocabulary — source guards', () => {
  test('enterpriseMetrics counts no token outside the sql/034 vocabulary', () => {
    const source = readCode(METRICS);
    // `interviewed` and `offered` never existed in any vocabulary (the original bug).
    expect(source).not.toContain('interviewed');
    expect(source).not.toContain("'offered'");
  });

  test('EnterpriseDashboard renders canonical funnel stages and no dead tokens', () => {
    const source = readCode(DASHBOARD);

    // Dead tokens from the old funnel / old pipeline.
    expect(source).not.toContain('interviewed');
    expect(source).not.toContain('offered');
    expect(source).not.toContain('draft');
    expect(source).not.toContain('fulfilled');

    // Canonical stages the funnel must render.
    expect(source).toContain('funnel.interview');
    expect(source).toContain('funnel.qualified');
    expect(source).toContain('funnel.pendingProfileValidation');

    // Reconciliation guard is wired into the fetch.
    expect(source).toContain('funnelAccountsForAllApplications');

    // Workforce pipeline goes through the company-facing projection.
    expect(source).toContain('getCompanyStatusConfig');
  });

  test('EnterpriseDashboard does not read jobs.applications_count', () => {
    const source = readCode(DASHBOARD);
    // Until sql/040 ships, this column lies (0 for every job). Counts must
    // derive from the job_applications rows the page already fetches.
    expect(source).not.toContain('applications_count');
  });

  test('CompanyDashboard counts hires all-time (no invented month window)', () => {
    const source = readCode(COMPANY_DASHBOARD);
    // The old code filtered `status === 'hired' && created_at >= monthAgo` —
    // created_at is the application date, not the hire date (ticket §1.4).
    expect(source).not.toContain('monthAgo');
    // `saved` is not a token the state machine can write.
    expect(source).not.toContain("'saved'");
    // Per-job counts match by job_id, not by title.
    expect(source).toContain('a.job_id === j.id');
  });
});

/* ─── 3. COUNT-INTEGRITY SQL ─── */

test.describe('count integrity — sql/040', () => {
  test('the migration exists and is shaped like the repo canon', () => {
    const sql = read(COUNT_SQL);

    // Trigger function: SECURITY DEFINER with a fixed search_path (anti-hijack).
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toContain('pb_job_applications_count_trg');

    // Idempotent re-execution.
    expect(sql).toContain('DROP TRIGGER IF EXISTS pb_jobs_applications_count_sync');

    // Backfill repairs the existing drift.
    expect(sql).toMatch(/UPDATE public\.app_14da0f1941_jobs\s+j\s+SET applications_count/);

    // Reconciliation gate present.
    expect(sql).toContain('applications_count <>');

    // Documented rollback.
    expect(sql).toContain('ROLLBACK');
  });
});

/* ─── 4. Pricing-page truth ─── */

test.describe('pricing page — no unverified promises', () => {
  const UNVERIFIED_CLAIMS = [
    'compliance reports',
    '10 recruiter accounts',
    '2 recruiter accounts',
    'Kanban',
    'Analytics dashboard + export',
    'saved filters',
    '3 job posts',
    '15 job posts',
    'Certification verification',
  ];

  for (const claim of UNVERIFIED_CLAIMS) {
    test(`pricing page no longer claims "${claim}"`, () => {
      const source = readCode(PRICING);
      expect(
        source.includes(claim),
        `PricingPage still promises "${claim}" — capability not verified. See COMPANY_PRODUCT_GAP_MATRIX.`
      ).toBe(false);
    });
  }

  test('claims that ARE verified remain present', () => {
    const source = readCode(PRICING);
    // Live and verified capabilities the ladder is allowed to promise.
    expect(source).toContain('Job posting');
    expect(source).toContain('Basic worker search');
    expect(source).toContain('Candidate messaging');
    expect(source).toContain('Candidate pipeline (ATS)');
    expect(source).toContain('Candidate certification profiles');
    expect(source).toContain('Multi-recruiter enterprise dashboard');
    expect(source).toContain('Workforce requests');
  });

  test('no public price literals are introduced (GO rule: no public pricing)', () => {
    const source = readCode(PRICING);
    // Prices must keep resolving from the Stripe catalog, never hardcoded.
    expect(source).not.toMatch(/price:\s*['"]€?\d/);
    expect(source).not.toMatch(/price:\s*['"]\$\d/);
  });
});

/* ─── 5. i18n label matches the all-time hires semantics ─── */

test.describe('i18n — hires label tells the truth', () => {
  const LOCALES = ['bg', 'de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ro', 'uk'];

  /**
   * The exact month-window phrases this ticket replaced. Full-phrase matching,
   * not substrings: Dutch "Aannames" contains "mes" but means "Hires".
   */
  const MONTH_WINDOW_PHRASES = [
    'this month', // en
    'este mes', // es
    'este mês', // pt
    'ce mois', // fr
    'questo mese', // it
    'deze maand', // nl
    'diesen monat', // de
    'tym miesiącu', // pl
    'acest mesec', // bg
    'luna aceasta', // ro
    'цього місяця', // uk
  ];

  for (const locale of LOCALES) {
    test(`${locale} hiresThisMonth no longer promises a month window`, () => {
      const raw = read(`app/frontend/src/i18n/locales/${locale}.json`);
      const value = JSON.parse(raw).companyDashboard?.hiresThisMonth;
      expect(value, `locale ${locale} missing companyDashboard.hiresThisMonth`).toBeTruthy();
      // The metric is all-time hires; the label must not promise a month window.
      const lower = (value as string).toLowerCase();
      for (const phrase of MONTH_WINDOW_PHRASES) {
        expect(
          lower.includes(phrase),
          `locale ${locale} label "${value}" still implies a month window`
        ).toBe(false);
      }
    });
  }
});
