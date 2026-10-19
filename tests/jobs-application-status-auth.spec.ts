import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-JOBS-APPLICATION-STATUS-AUTH-001 — Canonical transition control gate.
 *
 * Pins the P0 fix: direct table writes on job applications are closed and
 * every transition goes through the canonical RPC (sql/034) or backend
 * SECURITY DEFINER writers. Verified live against QA (see delivery doc):
 *
 *  E1 worker → hired (direct):            BLOCKED (REVOKE 42501)
 *  E2 worker → sent_to_client (direct):   BLOCKED (REVOKE 42501)
 *  E3 company → hired (direct):           BLOCKED (REVOKE 42501)
 *  E6 worker reassigns company_user_id:   BLOCKED (REVOKE 42501)
 *  worker DELETE direct:                  BLOCKED (REVOKE 42501)
 *  (with GRANT reopened) worker → hired:  BLOCKED (trigger 42501 forbidden)
 *  (with GRANT reopened) company → withdr: BLOCKED (trigger 42501 forbidden)
 *  RPC worker → withdrawn:                ALLOWED (event actor_role=worker)
 *  RPC company → sent_to_client (ready):  ALLOWED (event actor_role=company)
 *  RPC company → sent_to_client (!ready): BLOCKED (profile_not_marketplace_ready)
 *  backend 034 false→true activation:     pending → applied (event system)
 *
 * These tests are pure source assertions: no browser, no network.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

const SQL = read('sql/054-pb-jobs-application-status-auth.sql');
const APPLICATIONS_PAGE = read('app/frontend/src/pages/Applications.tsx');

test.describe('PB-JOBS-APPLICATION-STATUS-AUTH-001 — sql/054 canonical guard', () => {
  test('creates the BEFORE UPDATE OR DELETE guard trigger', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION public.app_14da0f1941_guard_application_write()');
    expect(SQL).toContain('BEFORE UPDATE OR DELETE ON public.app_14da0f1941_job_applications');
  });

  test('exempts canonical backend writers (postgres session role and service_role)', () => {
    expect(SQL).toContain("v_cur_user IN ('postgres', 'service_role')");
    expect(SQL).toContain("v_jwt_role = 'service_role'");
  });

  test('blocks direct DELETE for non-privileged actors', () => {
    expect(SQL).toMatch(/IF TG_OP = 'DELETE' THEN[\s\S]*?RAISE EXCEPTION 'forbidden'/);
  });

  test('makes identity columns immutable for non-admin actors', () => {
    expect(SQL).toContain('NEW.user_id IS DISTINCT FROM OLD.user_id');
    expect(SQL).toContain('NEW.job_id IS DISTINCT FROM OLD.job_id');
    expect(SQL).toContain('NEW.company_user_id IS DISTINCT FROM OLD.company_user_id');
  });

  test('worker may only transition to withdrawn (never self-award pipeline states)', () => {
    expect(SQL).toContain("NEW.status <> 'withdrawn'");
  });

  test('company may never set internal states (pending_profile_validation / withdrawn)', () => {
    expect(SQL).toContain("NEW.status IN ('pending_profile_validation', 'withdrawn')");
  });

  test('rejects terminal reopen for worker', () => {
    expect(SQL).toContain("OLD.status = ANY (v_terminal)");
  });

  test('revokes direct UPDATE/DELETE from API roles (channel closed)', () => {
    expect(SQL).toContain('REVOKE UPDATE, DELETE ON TABLE public.app_14da0f1941_job_applications FROM anon');
    expect(SQL).toContain('REVOKE UPDATE, DELETE ON TABLE public.app_14da0f1941_job_applications FROM authenticated');
  });

  test('documents a non-destructive rollback', () => {
    expect(SQL).toContain('ROLLBACK');
    expect(SQL).toContain('DROP TRIGGER IF EXISTS app_14da0f1941_job_applications_guard_write');
  });
});

test.describe('PB-JOBS-APPLICATION-STATUS-AUTH-001 — worker withdraw uses canonical RPC', () => {
  test('Applications.tsx withdraws via app_update_application_status, not DELETE', () => {
    expect(APPLICATIONS_PAGE).toContain("supabase.rpc('app_update_application_status'");
    expect(APPLICATIONS_PAGE).toContain("p_new_status: 'withdrawn'");
  });

  test('Applications.tsx no longer deletes the application row on withdraw', () => {
    const withdrawBlock = APPLICATIONS_PAGE.slice(
      APPLICATIONS_PAGE.indexOf('const withdrawApplication'),
      APPLICATIONS_PAGE.indexOf('const filteredApplications'),
    );
    expect(withdrawBlock).not.toContain('.delete()');
  });

  test('withdrawn application stays listed with its new status (history preserved)', () => {
    expect(APPLICATIONS_PAGE).toContain("status: 'withdrawn'");
  });
});
