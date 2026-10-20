import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-JOBS-MARKETPLACE-READY-RECOVERY-001 — Targeted recovery contract (PO FASE 2).
 *
 * Pins the PO-mandated redesign of sql/045: the production recovery MUST be a
 * targeted, explicit user_id batch derived from the approved dry-run — never a
 * global sweep over all eligible profiles. Every user in the batch must have
 * at least one real pending_profile_validation application at execution time;
 * the backend revalidates every canonical requirement and skips fail-closed.
 *
 * These tests are pure source assertions: no browser, no network.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

const SQL = read('sql/045-pb-jobs-marketplace-ready-recovery.sql');

test.describe('PB-JOBS-MARKETPLACE-READY-RECOVERY-001 — targeted batch contract', () => {
  test('recovery function takes an explicit user_id batch (uuid[]), not a sweep limit', () => {
    expect(SQL).toContain('public.pb_sync_stale_marketplace_ready(\n  p_batch_id text,\n  p_user_ids uuid[]\n)');
    expect(SQL).not.toMatch(/CREATE OR REPLACE FUNCTION public\.pb_sync_stale_marketplace_ready\(\s*p_batch_id text,\s*p_limit/);
  });

  test('the rejected global sweep signature is dropped', () => {
    expect(SQL).toContain('DROP FUNCTION IF EXISTS public.pb_sync_stale_marketplace_ready(text, integer)');
  });

  test('never iterates the profiles table (no global scan)', () => {
    const fnBody = SQL.slice(SQL.indexOf('public.pb_sync_stale_marketplace_ready('));
    expect(fnBody).not.toMatch(/FOR r IN\s+SELECT p\.user_id\s+FROM public\.app_14da0f1941_profiles/);
    expect(fnBody).toContain('FOREACH v_uid IN ARRAY p_user_ids');
  });

  test('batch_id remains mandatory and validated', () => {
    expect(SQL).toContain("p_batch_id !~ '^[a-zA-Z0-9_-]{1,80}$'");
    expect(SQL).toContain("RAISE EXCEPTION 'batch_id explicito requerido'");
  });

  test('null user list is rejected; empty list is a no-op', () => {
    expect(SQL).toContain('IF p_user_ids IS NULL THEN');
    expect(SQL).toContain("RAISE EXCEPTION 'user_ids explicito requerido");
  });

  test('requires >=1 real pending application per user at execution time (Jobs scope gate)', () => {
    expect(SQL).toContain("AND status = 'pending_profile_validation'");
    expect(SQL).toContain('IF v_pending = 0 THEN');
    expect(SQL).toContain('v_nopend := v_nopend + 1;');
    expect(SQL).toContain('CONTINUE;');
  });

  test('reports the no_pending skip outcome explicitly', () => {
    expect(SQL).toMatch(/RETURNS TABLE\([\s\S]*?no_pending\s+integer[\s\S]*?errors\s+integer\s*\)/);
    expect(SQL).toContain('RETURN QUERY SELECT v_evaluated, v_promoted, v_already, v_not, v_legacy, v_nopend, v_err;');
  });

  test('delegates requirement revalidation to the canonical sync (fail-closed per user)', () => {
    expect(SQL).toContain('SELECT * INTO v_res FROM public.pb_sync_marketplace_ready_state(v_uid, p_batch_id)');
    expect(SQL).toContain('EXCEPTION WHEN OTHERS THEN');
  });

  test('promotion stays consent-gated and contract v2 only', () => {
    expect(SQL).toContain('v_profile.marketplace_contract_version IS DISTINCT FROM 2');
    expect(SQL).toContain("'contract_version_required'");
    expect(SQL).toContain('v_profile.marketplace_consent_declared IS NOT TRUE');
    expect(SQL).toContain("'consent_required'");
    expect(SQL).toContain('public.pb_marketplace_ready_for(p_user_id, TRUE)');
  });

  test('EXECUTE is restricted to service_role on both recovery functions', () => {
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.pb_sync_stale_marketplace_ready(text, uuid[]) FROM PUBLIC, anon, authenticated');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.pb_sync_stale_marketplace_ready(text, uuid[]) TO service_role');
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.pb_sync_marketplace_ready_state(uuid, text) FROM PUBLIC, anon, authenticated');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.pb_sync_marketplace_ready_state(uuid, text) TO service_role');
  });

  test('cross-user authorization on the application-gate wrapper (PO review P1)', () => {
    expect(SQL).toContain('IF v_actor IS DISTINCT FROM p_user_id THEN');
    expect(SQL).toContain("RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'");
    expect(SQL).toContain("RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'");
    expect(SQL).toContain("v_claims::jsonb ->> 'role', '') = 'service_role'");
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.app_14da0f1941_sync_ready_for_application(uuid) FROM PUBLIC, anon');
    expect(SQL).toContain('GRANT EXECUTE ON public.app_14da0f1941_sync_ready_for_application(uuid) TO authenticated'.replace('GRANT EXECUTE ON', 'GRANT EXECUTE ON FUNCTION'));
  });

  test('never reaches sent_to_client and never mutates ownership', () => {
    // Strip line comments: the string appears in design rationales only.
    const code = SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(code).not.toContain('sent_to_client');
    expect(code).not.toMatch(/UPDATE public\.app_14da0f1941_job_applications/);
    expect(code).not.toMatch(/SET\s+(user_id|job_id|company_user_id)\s*=/);
  });

  test('audit: every promotion lands in reconcile_log with batch correlation, no PII', () => {
    expect(SQL).toContain('INSERT INTO public.pb_marketplace_ready_reconcile_log');
    expect(SQL).toContain("'stale_sync_promoted'");
    expect(SQL).toContain('v_batch');
  });
});
