import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PB-PROFILE-COMPLETION-RECONCILIATION-001 — Live-sync contract (T1-T12).
 *
 * Pins the fix for the frozen profile_completion drift (115/259 stale profiles
 * in production, 2026-10-20 audit): every scoring-relevant mutation must end
 * with a canonical recalculation, and that recalculation must keep-or-degrade,
 * never promote marketplace_ready.
 *
 * T1..T6   triggers exist for every relevant mutation (add/edit/delete in
 *          experiences/certifications/documents, profile scoring columns, CV).
 * T7..T8   reconciliation tool + idempotency of the canonical RPC.
 * T9       never-promote semantics preserved.
 * T10      dry-run identifies pending_profile_validation candidates (read-only).
 * T11      legacy/orphan CV handled by dry-run only, never auto-migrated.
 * T12      new CV upload always writes canonical storage columns.
 * + mandatory no-recursion test for the profiles trigger.
 *
 * Pure source assertions: no browser, no network.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf-8');

const SQL056 = read('sql/056-pb-profile-completion-live-sync.sql');
const SQL036 = read('sql/036-pb-profiles-insert-guard-canonical-state.sql');
const DRYRUN = read('sql/qa/qa-profile-completion-reconciliation-dryrun.sql');
const CV_UPLOAD = read('app/frontend/src/components/profile/CVUploadSection.tsx');

const CHILD_TRIGGERS = [
  ['pb_profile_state_sync_experiences', 'app_worker_experiences'],
  ['pb_profile_state_sync_certifications', 'app_worker_certifications'],
  ['pb_profile_state_sync_documents', 'app_worker_documents'],
] as const;

test.describe('PB-PROFILE-COMPLETION-RECONCILIATION-001 — live-sync contract (T1-T12)', () => {
  test('T1/T2/T3: AFTER INSERT OR UPDATE OR DELETE trigger on each child table calls the canonical recalc', () => {
    for (const [tg, table] of CHILD_TRIGGERS) {
      expect(SQL056).toContain(`DROP TRIGGER IF EXISTS ${tg} ON public.${table};`);
      expect(SQL056).toMatch(
        new RegExp(`CREATE TRIGGER ${tg}\\s+AFTER INSERT OR UPDATE OR DELETE ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.pb_sync_profile_state_after_change\\(\\);`),
      );
    }
    expect(SQL056).toContain('PERFORM public.pb_recalculate_profile_state(v_user_id, 1);');
  });

  test('T4/T5: CV add/change/delete recalculates via profiles scoring-column trigger (cv_storage_bucket/cv_storage_path/cv_file_url/cv_url)', () => {
    const block = SQL056.slice(SQL056.indexOf('CREATE TRIGGER pb_profile_state_sync_profile_scoring'));
    for (const col of ['cv_storage_bucket', 'cv_storage_path', 'cv_file_url', 'cv_url']) {
      expect(block).toContain(col);
    }
  });

  test('T6: experience delete recalculates (DELETE is part of the child-table trigger events)', () => {
    expect(SQL056).toMatch(/CREATE TRIGGER pb_profile_state_sync_experiences\s+AFTER INSERT OR UPDATE OR DELETE/);
  });

  test('T7: stale reconciliation uses ONLY the canonical RPC; 056 ships no data backfill', () => {
    expect(SQL036).toContain('CREATE OR REPLACE FUNCTION public.pb_recalculate_profile_state(\n  p_user_id uuid DEFAULT NULL,\n  p_limit integer DEFAULT 2000\n)');
    expect(SQL056).not.toMatch(/^\s*(UPDATE|INSERT INTO)\s+public\.app_14da0f1941_profiles/m);
    expect(DRYRUN).toContain('SELECT public.pb_recalculate_profile_state(NULL, 500)');
  });

  test('T8: canonical RPC only writes when something differs (second run => changed = 0)', () => {
    expect(SQL036).toContain('IF r.profile_completion IS DISTINCT FROM v_completion\n       OR r.onboarding_status IS DISTINCT FROM v_status\n       OR r.marketplace_ready IS DISTINCT FROM v_ready THEN');
    expect(SQL036).toContain('v_changed := v_changed + 1;');
  });

  test('T9: keep-or-degrade, NEVER promote marketplace_ready (RPC semantics intact, 056 does not touch them)', () => {
    // Semántica canónica: ready = valor_actual AND consentimiento AND >=30.
    expect(SQL036).toContain('v_ready := (r.marketplace_ready IS TRUE)\n               AND public.pb_marketplace_consent_columns(r.profile_visibility, r.cv_visible)\n               AND v_completion >= 30;');
    // 056 no redefine la familia pb_* ni el camino de promoción.
    expect(SQL056).not.toContain('pb_complete_onboarding(');
    expect(SQL056).not.toMatch(/CREATE OR REPLACE FUNCTION public\.pb_(profile_completion_score|recalculate_profile_state|complete_onboarding|marketplace_consent|onboarding_status)/);
    expect(SQL056).not.toContain('marketplace_ready := true');
    // Pesos y umbral intactos en la fórmula única (acumulador de 036).
    expect(SQL036).toContain('-- hasCv(): canonico cv_storage_bucket+cv_storage_path');
    expect((SQL036.match(/v_score := v_score \+ 15;/g) ?? []).length).toBe(2); // CV 15 + experiencia 15
    expect(SQL036).toContain('>= 30');
  });

  test('T10: dry-run is 100% read-only and previews affected profiles + applications scope', () => {
    expect(DRYRUN).not.toMatch(/^\s*(UPDATE|INSERT INTO|DELETE FROM|CREATE|DROP|ALTER)\s/m);
    expect(DRYRUN).toContain('stored_score');
    expect(DRYRUN).toContain('computed_score');
    expect(DRYRUN).toContain('change_class');
  });

  test('T11: legacy/orphan CV is surfaced by the dry-run, never auto-migrated by 056', () => {
    expect(DRYRUN).toContain("o.name LIKE '%/cv-%'");
    expect(DRYRUN).toContain('CV HUÉRFANOS');
    expect(SQL056).not.toContain('storage.objects');
    expect(SQL056).not.toMatch(/UPDATE public\.app_14da0f1941_profiles\s+SET cv_/);
  });

  test('T12: new CV upload always writes the canonical storage columns (backend-recognized CV)', () => {
    // Bloque de upsert canónico (PB-STORAGE-SECURITY-001 phase 2): el backend
    // reconoce el CV por bucket+path; la URL pública legacy se limpia a null.
    const upsert = CV_UPLOAD.slice(CV_UPLOAD.indexOf('cv_file_url: null,'));
    expect(upsert).toContain('cv_storage_bucket: bucketName');
    expect(upsert).toContain('cv_storage_path: path');
    expect(upsert).toContain('cv_file_name: file.name');
    expect(upsert).toContain('cv_file_path: path');
    expect(upsert).toContain('cv_uploaded_at: new Date().toISOString()');
  });

  test('MANDATORY no-recursion: profiles trigger fires ONLY on scoring-source columns, never on profile_completion/onboarding_status/marketplace_ready', () => {
    const def = SQL056.slice(
      SQL056.indexOf('CREATE TRIGGER pb_profile_state_sync_profile_scoring'),
      SQL056.indexOf('ON public.app_14da0f1941_profiles', SQL056.indexOf('CREATE TRIGGER pb_profile_state_sync_profile_scoring')),
    );
    // Exactamente las columnas fuente del scoring...
    for (const col of ['avatar_url', 'full_name', 'title', 'company', 'location', 'years_experience', 'skills', 'bio', 'cv_storage_bucket', 'cv_storage_path', 'cv_file_url', 'cv_url']) {
      expect(def).toContain(col);
    }
    // ...y ninguna de las columnas que escribe el recálculo.
    expect(def).not.toContain('profile_completion');
    expect(def).not.toContain('onboarding_status');
    expect(def).not.toContain('marketplace_ready');
    // AFTER UPDATE OF (no INSERT: la fila nace normalizada por el guard de 036).
    expect(def).toContain('AFTER UPDATE OF');
    expect(def).not.toMatch(/AFTER INSERT/);
  });

  test('SECURITY DEFINER is justified, search_path pinned, no client EXECUTE, fail-open with WARNING', () => {
    expect(SQL056).toContain('SECURITY DEFINER');
    expect(SQL056).toContain('SET search_path = public, pg_temp');
    expect(SQL056).toContain('REVOKE ALL ON FUNCTION public.pb_sync_profile_state_after_change() FROM PUBLIC, anon, authenticated;');
    expect(SQL056).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(SQL056).toContain('RAISE WARNING');
    expect(SQL056).not.toContain('EXECUTE IMMEDIATE'); // sin SQL dinámico
  });

  test('idempotent + reversible: DROP IF EXISTS before CREATE, exact rollback block documented', () => {
    for (const [tg] of CHILD_TRIGGERS) {
      expect(SQL056).toContain(`DROP TRIGGER IF EXISTS ${tg}`);
    }
    expect(SQL056).toContain('DROP TRIGGER IF EXISTS pb_profile_state_sync_profile_scoring');
    expect(SQL056).toContain('CREATE OR REPLACE FUNCTION public.pb_sync_profile_state_after_change()');
    expect(SQL056).toContain('ROLLBACK EXACTO');
    expect(SQL056).toContain('DROP FUNCTION IF EXISTS public.pb_sync_profile_state_after_change();');
  });
});
