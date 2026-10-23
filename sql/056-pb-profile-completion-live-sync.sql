-- =============================================================================
-- PB-PROFILE-COMPLETION-RECONCILIATION-001 — Sincronización viva de
-- profile_completion / onboarding_status / marketplace_ready (FASE 3 del fix)
-- =============================================================================
--
-- PROBLEMA (RCA FASE 2, audit producción 2026-10-20):
--   profile_completion quedó congelado desde que pb_profile_role_guard_001
--   (2026-09-04) cerró la escritura cliente de columnas protegidas y sql/036
--   (2026-10-16) unificó la fórmula en SQL SIN crear triggers de recálculo.
--   Las mutaciones post-onboarding (experiencias, certificados, documentos,
--   CV, avatar, campos de perfil) no disparan ningún recálculo: el frontend
--   llama a un NO-OP explícito y no existe cron ni trigger alguno.
--   Resultado auditado: 115/259 perfiles stale (108 por debajo, 7 por encima),
--   24 con stored < 30 que computan >= 30, 36 con onboarding_status
--   inconsistente. marketplace_ready: 0 inconsistencias.
--
-- FIX: UNA fuente de verdad (familia pb_* de sql/036, sin tocar pesos,
--   umbral 30, consentimiento, Jobs ni emails) + sincronización automática
--   tras cada mutación relevante, vía triggers que invocan el recálculo
--   canónico existente. La semántica de pb_recalculate_profile_state se
--   mantiene INTACTA: mantiene o degrada marketplace_ready, NUNCA promueve
--   (la promoción sigue siendo exclusiva de pb_complete_onboarding /
--   pb_sync_marketplace_ready_state con consentimiento declarado).
--
-- POR QUÉ SECURITY DEFINER AQUÍ (excepción justificada, precedente vivo:
--   app_14da0f1941_sync_ready_for_application en sql/045):
--   pb_recalculate_profile_state es SECURITY INVOKER con EXECUTE solo para
--   service_role; un INSERT/UPDATE/DELETE de un usuario authenticated en las
--   tablas hijas no podría ejecutarla. El trigger corre como owner (postgres),
--   lo que además hace pasar el guard pb_profiles_privilege_guard
--   (current_user IN ('postgres','supabase_admin')) en el UPDATE interno de
--   columnas protegidas. Sin SQL dinámico, sin parámetros de cliente,
--   search_path fijado.
--
-- FAIL-OPEN CONTROLADO: si el recálculo falla, la mutación del usuario NO se
--   rompe; queda WARNING en logs y la reconciliación idempotente lo repara.
--   (Fail-closed convertiría un problema cosmético en denegación de escritura
--   de perfil. Decisión registrada en la FASE 3 del RCA.)
--
-- NO TOCA: pesos, umbral (30), consentimiento, RLS, grants de tabla, gate de
--   Jobs, outbox/emails, estados de candidaturas. NO incluye backfill de
--   datos: la reconciliación histórica (FASE 4) es una operación aparte con
--   su propio GO, backup lógico y dry-run (ver sql/qa/…-dryrun.sql).
--
-- IDEMPOTENTE: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- REVERSIBLE AL 100%: sección ROLLBACK al final (no toca datos).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TRIGGER FUNCTION — sincroniza el estado canónico de UN usuario
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_sync_profile_state_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- TG_OP='DELETE' → OLD; resto → NEW. En el trigger de profiles ambos llevan
  -- user_id; en las tablas hijas igual.
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recálculo canónico: mantiene o degrada, nunca promueve (sql/036 §4).
  -- p_limit=1 porque el RPC filtra por p_user_id; el ORDER BY/LIMIT es
  -- irrelevante con un solo perfil pero se fija por contrato.
  BEGIN
    PERFORM public.pb_recalculate_profile_state(v_user_id, 1);
  EXCEPTION WHEN OTHERS THEN
    -- Fail-open controlado: no romper la mutación del usuario. Sin PII.
    RAISE WARNING 'pb_sync_profile_state_after_change: recalculo fallido para un perfil (%, op % en %). Reparable via reconciliacion idempotente.',
      SQLERRM, TG_OP, TG_TABLE_NAME;
  END;

  RETURN COALESCE(NEW, OLD);
END $$;

-- El trigger dispara con independencia del rol que escribe; el EXECUTE no se
-- concede a nadie para evitar invocación directa fuera de trigger.
REVOKE ALL ON FUNCTION public.pb_sync_profile_state_after_change() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TRIGGERS EN TABLAS HIJAS — experiencia / certificación / documento
--    (add / edit / delete provocan recálculo)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS pb_profile_state_sync_experiences ON public.app_worker_experiences;
CREATE TRIGGER pb_profile_state_sync_experiences
  AFTER INSERT OR UPDATE OR DELETE ON public.app_worker_experiences
  FOR EACH ROW EXECUTE FUNCTION public.pb_sync_profile_state_after_change();

DROP TRIGGER IF EXISTS pb_profile_state_sync_certifications ON public.app_worker_certifications;
CREATE TRIGGER pb_profile_state_sync_certifications
  AFTER INSERT OR UPDATE OR DELETE ON public.app_worker_certifications
  FOR EACH ROW EXECUTE FUNCTION public.pb_sync_profile_state_after_change();

DROP TRIGGER IF EXISTS pb_profile_state_sync_documents ON public.app_worker_documents;
CREATE TRIGGER pb_profile_state_sync_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.app_worker_documents
  FOR EACH ROW EXECUTE FUNCTION public.pb_sync_profile_state_after_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRIGGER EN PROFILES — SOLO columnas fuente del scoring
--    CRÍTICO (no-recursión): la lista UPDATE OF contiene EXACTAMENTE las
--    columnas que alimentan pb_profile_completion_score y NINGUNA de las
--    columnas que escribe pb_recalculate_profile_state
--    (profile_completion / onboarding_status / marketplace_ready).
--    Por tanto el UPDATE interno del recálculo NO vuelve a disparar este
--    trigger: recursión imposible por construcción, sin depender de
--    pg_trigger_depth() ni WHEN.
--    pb_complete_onboarding tampoco toca estas columnas → sin doble recálculo.
--    INSERT: sin trigger (la fila nace normalizada a 0/AUTH_ONLY/false por
--    el guard de sql/036; el wizard es quien sincroniza al terminar).
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS pb_profile_state_sync_profile_scoring ON public.app_14da0f1941_profiles;
CREATE TRIGGER pb_profile_state_sync_profile_scoring
  AFTER UPDATE OF avatar_url, full_name, title, company, location,
                  years_experience, skills, bio,
                  cv_storage_bucket, cv_storage_path, cv_file_url, cv_url
  ON public.app_14da0f1941_profiles
  FOR EACH ROW EXECUTE FUNCTION public.pb_sync_profile_state_after_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. COMMENT ON
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.pb_sync_profile_state_after_change() IS 'PB-PROFILE-COMPLETION-RECONCILIATION-001: sincronizacion viva del estado canonico del perfil. Disparada por mutaciones en app_worker_experiences/app_worker_certifications/app_worker_documents (INSERT/UPDATE/DELETE) y por UPDATE de columnas fuente del scoring en app_14da0f1941_profiles. Delega en pb_recalculate_profile_state (mantiene o degrada; NUNCA promueve marketplace_ready). SECURITY DEFINER justificado: el RPC es INVOKER con EXECUTE solo service_role y el guard de columnas protegidas exige postgres/supabase_admin/service_role. Fail-open con WARNING (reparable via reconciliacion idempotente).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. VERIFICACIÓN POST-APLICACIÓN (ejecutar y exigir exactamente esto)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Cuatro triggers nuevos, ninguno duplicado, ninguno sobre columnas
--    protegidas:
--    SELECT tgname, tgrelid::regclass::text, pg_get_triggerdef(oid)
--    FROM pg_trigger
--    WHERE tgname LIKE 'pb_profile_state_sync_%' AND NOT tgisinternal
--    ORDER BY tgname;
--    -> 4 filas; la de profiles contiene 'UPDATE OF avatar_url, full_name,
--       title, company, location, years_experience, skills, bio,
--       cv_storage_bucket, cv_storage_path, cv_file_url, cv_url' y NO contiene
--       profile_completion | onboarding_status | marketplace_ready.
-- 2) La función es DEFINER con search_path fijado y sin EXECUTE público:
--    SELECT proname, prosecdef, proconfig FROM pg_proc
--    WHERE proname = 'pb_sync_profile_state_after_change';
--    -> prosecdef = true; proconfig = {search_path=public,pg_temp}
--    SELECT grantee FROM information_schema.routine_privileges
--    WHERE routine_name = 'pb_sync_profile_state_after_change';
--    -> solo owner (postgres); nada para anon/authenticated/service_role.
-- 3) Fórmula, consentimiento, escalera y grants de sql/036 intactos:
--    repetir la verificación §7 de sql/036 (7 funciones, prosecdef=false en
--    todas ellas; esta migración no las toca).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK EXACTO (manual — NO ejecutar salvo incidente/inciso del PO):
-- Devuelve la base al estado previo (sin sincronización viva). No toca datos:
-- los valores ya recalculados quedan (son correctos por definición de la
-- fórmula canónica); simplemente se detiene la sincronización automática.
--   BEGIN;
--   DROP TRIGGER IF EXISTS pb_profile_state_sync_profile_scoring ON public.app_14da0f1941_profiles;
--   DROP TRIGGER IF EXISTS pb_profile_state_sync_documents ON public.app_worker_documents;
--   DROP TRIGGER IF EXISTS pb_profile_state_sync_certifications ON public.app_worker_certifications;
--   DROP TRIGGER IF EXISTS pb_profile_state_sync_experiences ON public.app_worker_experiences;
--   DROP FUNCTION IF EXISTS public.pb_sync_profile_state_after_change();
--   COMMIT;
-- Verificación del rollback:
--   SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'pb_profile_state_sync_%' AND NOT tgisinternal;  -> 0
--   SELECT count(*) FROM pg_proc WHERE proname = 'pb_sync_profile_state_after_change';                  -> 0
-- =============================================================================
