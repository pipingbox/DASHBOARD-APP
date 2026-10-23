import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-JOBS-COMPANY-WITHDRAWN-SEMANTICS-001 — `withdrawn` reserved for the
 * Worker (P1). Pins the semantic fix on the canonical RPC:
 *
 *  company (own application)  → withdrawn:  FORBIDDEN (was ok=true — C8)
 *  company (own application)  → rejected:   ALLOWED + company event (unchanged)
 *  company (cross-company)    → withdrawn:  FORBIDDEN (unchanged)
 *  worker (own)               → withdrawn:  ALLOWED (unchanged)
 *  worker (foreign)           → withdrawn:  FORBIDDEN (unchanged)
 *  admin/jobs_moderator       → withdrawn:  ALLOWED, audited (contract intact)
 *  system (034/039/045)       → never uses withdrawn (Marketplace Ready intact)
 *  direct PATCH               → withdrawn:  42501 (REVOKE + guard 054 intact)
 *  company reject retry       → idempotent (unchanged)
 *
 * Frontend contract: the company status select must NOT offer 'withdrawn'
 * as an action; 'withdrawn' stays visible as read-only filter/badge with
 * i18n labels in every locale.
 *
 * These tests are pure source assertions: no browser, no network.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

const SQL = read('sql/055-pb-jobs-company-withdrawn-semantics-001.sql');
const SQL_054 = read('sql/054-pb-jobs-application-status-auth.sql');
const SQL_034 = read('sql/034-pb-jobs-marketplace-ready-activation.sql');
const COMPANY_CANDIDATES = read('app/frontend/src/pages/company/CompanyCandidates.tsx');
const CANDIDATE_PROFILE = read('app/frontend/src/pages/company/CandidateProfile.tsx');
const APPLICATIONS = read('app/frontend/src/pages/Applications.tsx');

test.describe('PB-JOBS-COMPANY-WITHDRAWN-SEMANTICS-001 — sql/055 RPC semantics', () => {
  test('reserves withdrawn for the worker owner inside the canonical RPC', () => {
    expect(SQL).toContain("IF p_new_status = 'withdrawn'");
    expect(SQL).toContain('AND NOT (v_is_admin OR v_is_primary_admin)');
    expect(SQL).toContain('v_app.user_id IS DISTINCT FROM v_actor');
  });

  test('check is fail-closed: placed before idempotency so a company can never confirm withdrawn either', () => {
    const checkIdx = SQL.indexOf("IF p_new_status = 'withdrawn'");
    const idempotencyIdx = SQL.indexOf('-- Idempotency: already in target status');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(idempotencyIdx).toBeGreaterThan(checkIdx);
  });

  test('keeps the exact RPC signature, SECURITY DEFINER and search_path', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION public.app_update_application_status(');
    expect(SQL).toMatch(/p_application_id uuid,\s*p_new_status text,\s*p_note text DEFAULT NULL/);
    expect(SQL).toContain('RETURNS jsonb');
    expect(SQL).toContain('SECURITY DEFINER');
    expect(SQL).toContain('SET search_path = public');
  });

  test('preserves admin explicit audited capability (exempt from the new check)', () => {
    // The withdrawn reservation only fires for non-staff actors that are not
    // the applicant — admin/jobs_moderator corrections stay allowed per the
    // current contract, always audited via the events insert.
    const check = SQL.match(
      /IF p_new_status = 'withdrawn'[\s\S]*?RETURN jsonb_build_object\('ok', false, 'error', 'forbidden'\);[\s\S]*?END IF;/
    );
    expect(check).not.toBeNull();
    expect(check![0]).toContain('NOT (v_is_admin OR v_is_primary_admin)');
    expect(check![0]).not.toContain('v_is_company');
  });

  test('preserves grants: PUBLIC without EXECUTE, EXECUTE only authenticated', () => {
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.app_update_application_status(uuid, text, text) FROM PUBLIC"
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.app_update_application_status(uuid, text, text) TO authenticated"
    );
    expect(SQL).not.toMatch(/GRANT EXECUTE[^\n]*TO anon/);
    expect(SQL).not.toMatch(/GRANT EXECUTE[^\n]*TO service_role/);
  });

  test('does not touch table ACL, RLS/policies, triggers, Marketplace Ready or emails', () => {
    expect(SQL).not.toMatch(/GRANT (UPDATE|DELETE|INSERT|SELECT) ON TABLE/);
    expect(SQL).not.toMatch(/REVOKE (UPDATE|DELETE|INSERT|SELECT) ON TABLE/);
    expect(SQL).not.toContain('CREATE POLICY');
    expect(SQL).not.toContain('DROP POLICY');
    expect(SQL).not.toContain('CREATE TRIGGER');
    expect(SQL).not.toContain('DROP TRIGGER');
    expect(SQL).not.toContain('ALTER TABLE');
    expect(SQL).not.toContain('marketplace_ready_state');
    expect(SQL).not.toMatch(/pb_sync|welcome_email|sent_to_client_email/i);
    expect(SQL).not.toContain('ENABLE ROW LEVEL SECURITY');
    expect(SQL).not.toContain('DISABLE ROW LEVEL SECURITY');
  });

  test('keeps the full previous RPC behaviour (all guards from sql/034 intact)', () => {
    for (const guard of [
      "v_is_admin OR v_is_primary_admin OR v_is_company OR v_is_owner_withdraw",
      "'invalid_status'",
      "'not_found'",
      "'note_required_for_reopen'",
      "'profile_not_marketplace_ready'",
      "'not_authenticated'",
      'FOR UPDATE',
    ]) {
      expect(SQL).toContain(guard);
    }
  });

  test('contains an exact commented rollback restoring the previous body', () => {
    const rollbackIdx = SQL.indexOf('ROLLBACK EXACTO');
    expect(rollbackIdx).toBeGreaterThan(-1);
    const rollback = SQL.slice(rollbackIdx);
    // Previous body: no withdrawn reservation, marketplace_ready guard intact.
    expect(rollback).toContain('CREATE OR REPLACE FUNCTION public.app_update_application_status(');
    expect(rollback).not.toContain('IS DISTINCT FROM v_actor');
    expect(rollback).toContain("'profile_not_marketplace_ready'");
    expect(rollback).toContain("GRANT EXECUTE ON FUNCTION public.app_update_application_status(uuid, text, text) TO authenticated");
  });

  test('sql/054 guard (direct UPDATE company→withdrawn) remains the second line of defense, unmodified', () => {
    expect(SQL_054).toContain("NEW.status IN ('pending_profile_validation', 'withdrawn')");
  });

  test('system writers (034/039/045) never use withdrawn', () => {
    // Marketplace Ready lifecycle is pending↔applied only.
    expect(SQL_034).toMatch(/'pending_profile_validation'\s*,\s*'applied'/);
    expect(SQL_034).not.toContain("'applied', 'withdrawn'");
  });
});

test.describe('PB-JOBS-COMPANY-WITHDRAWN-SEMANTICS-001 — company UI contract', () => {
  test('status select no longer offers withdrawn as a company action', () => {
    expect(COMPANY_CANDIDATES).toContain('const COMPANY_ACTION_OPTIONS = STATUS_OPTIONS.filter(');
    expect(COMPANY_CANDIDATES).toContain("(s) => s !== 'withdrawn'");
    expect(COMPANY_CANDIDATES).toContain('{COMPANY_ACTION_OPTIONS.map((s) => (');
  });

  test('withdrawn remains a read-only filter and badge (candidate-initiated state)', () => {
    // Filter list still exposes all statuses for reading.
    expect(COMPANY_CANDIDATES).toContain("{['all', ...STATUS_OPTIONS].map((s) => (");
    // Badge config still renders a withdrawn label.
    expect(COMPANY_CANDIDATES).toContain("withdrawn: { label: t('companyCandidates.withdrawn')");
    // Read-only marker when the current status is withdrawn.
    expect(COMPANY_CANDIDATES).toContain("app.status === 'withdrawn' &&");
  });

  test('candidate profile actions never include withdraw', () => {
    const actions = CANDIDATE_PROFILE.match(/getStatusActions[\s\S]*?return actions;/);
    expect(actions).not.toBeNull();
    expect(actions![0]).not.toContain("'withdrawn'");
  });

  test('worker withdraw flow (Applications.tsx) still uses the canonical RPC with withdrawn', () => {
    expect(APPLICATIONS).toContain("p_new_status: 'withdrawn'");
    expect(APPLICATIONS).toContain("app_update_application_status");
  });

  test('select option labels are i18n keys present in every locale', () => {
    const locales = readdirSync(join(REPO_ROOT, 'app/frontend/src/i18n/locales')).filter((f) =>
      f.endsWith('.json')
    );
    expect(locales.length).toBeGreaterThanOrEqual(11);
    const keys = [
      'applied',
      'reviewed',
      'shortlisted',
      'sentToClient',
      'interview',
      'hired',
      'rejected',
      'withdrawn',
    ];
    for (const locale of locales) {
      const dict = JSON.parse(read(join('app/frontend/src/i18n/locales', locale)), 'utf-8');
      const cc = dict.companyCandidates ?? {};
      for (const key of keys) {
        expect(cc[key], `${locale} missing companyCandidates.${key}`).toBeTruthy();
      }
    }
  });
});
