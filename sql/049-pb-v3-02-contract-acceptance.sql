-- PR-V3-02 — PB-MARKETPLACE-V3-RECRUITMENT-001 / TRACK C
-- Wizard de aceptación del contrato Marketplace v3: consentimiento versionado,
-- auditable e idempotente.
--
-- Contrato del flujo:
--   * El usuario acepta el contrato v3 mediante ESTE RPC y solo para SÍ MISMO
--     (auth.uid(); no existe parámetro p_user_id — ni siquiera el patrón
--     actor=perfil de PR #84: aquí el actor ES el sujeto por construcción).
--   * El consentimiento queda versionado (marketplace_consent_version=3,
--     marketplace_consent_at) y auditado en una tabla append-only
--     (app_14da0f1941_marketplace_consent_events) con la versión del texto
--     mostrado. El cliente nunca envía el texto: solo actúa; la versión del
--     texto es una constante del servidor (mismo patrón que
--     app_consent_evidence, sql/012).
--   * Requisitos v3 evaluados por el predicado canónico (sql/047): cv,
--     profession, location, availability, consent. Certificados NO bloquean;
--     la completitud es independiente.
--   * PROHIBIDO promover sin consentimiento v3 válido: la sincronización
--     canónica exige marketplace_consent_version = 3 para perfiles del
--     contrato 3 (endurecimiento de pb_sync_marketplace_ready_state).
--   * PROHIBIDO EMAIL 2 histórico accidental: este RPC solo procesa al
--     usuario autenticado (un usuario, un acto real). EMAIL 2 solo nace de
--     una transición real false -> true por el outbox existente (sql/034).
--   * Idempotente: una segunda aceptación devuelve already_accepted SIN
--     duplicar evento de auditoría ni tocar el estado.
--   * Legacy v1 con marketplace_ready=true queda protegido: no se migra por
--     esta vía (reconciliación autorizada, sql/037).
--
-- Compatibilidad v1/v2: intacta. Los perfiles v1/v2 conservan su contrato
-- hasta aceptar v3 explícitamente por el wizard.
--
-- IDEMPOTENT: SÍ (create/alter if not exists, create or replace, revoke/grant).
-- STATUS: NO APLICADA. QA primero; producción solo con GO expreso del PO.

-- =============================================================================
-- 1. Columnas de consentimiento versionado
-- =============================================================================

ALTER TABLE public.app_14da0f1941_profiles
  ADD COLUMN IF NOT EXISTS marketplace_consent_version integer,
  ADD COLUMN IF NOT EXISTS marketplace_consent_at timestamptz;

COMMENT ON COLUMN public.app_14da0f1941_profiles.marketplace_consent_version IS
  'PR-V3-02: versión del contrato marketplace consentida por el wizard (3 = v3). Columna protegida: solo escritura backend canónica.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.marketplace_consent_at IS
  'PR-V3-02: timestamp UTC del consentimiento versionado. Columna protegida.';

-- =============================================================================
-- 2. Auditoría append-only de actos de consentimiento
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_marketplace_consent_events (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid not null,
  contract_version integer not null,
  consent_text_version text not null,
  source          text not null default 'wizard_v3'
);

COMMENT ON TABLE public.app_14da0f1941_marketplace_consent_events IS
  'PR-V3-02: evidencia append-only de actos de consentimiento del contrato marketplace. Un acto real del usuario = una fila. RLS cerrada; escritura solo backend canónico (RPC del wizard / service_role).';

ALTER TABLE public.app_14da0f1941_marketplace_consent_events ENABLE ROW LEVEL SECURITY;
-- Sin políticas: ni lectura ni escritura para authenticated/anon. El RPC
-- SECURITY DEFINER (propietario) y service_role escriben; la lectura
-- operativa se hace con service_role.

REVOKE ALL ON public.app_14da0f1941_marketplace_consent_events FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON public.app_14da0f1941_marketplace_consent_events TO service_role;

-- =============================================================================
-- 3. Endurecer el guard de columnas de contrato (sql/037) con las nuevas
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pb_profiles_contract_version_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_backend boolean := current_user IN ('postgres', 'supabase_admin', 'service_role');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT v_backend THEN
      NEW.marketplace_contract_version := 2;
      NEW.marketplace_consent_declared := false;
      NEW.marketplace_consent_version := NULL;
      NEW.marketplace_consent_at := NULL;
    END IF;
  ELSIF OLD.marketplace_contract_version = 1 AND OLD.marketplace_ready IS TRUE
    AND (NEW.marketplace_ready IS DISTINCT FROM OLD.marketplace_ready
         OR NEW.marketplace_contract_version IS DISTINCT FROM OLD.marketplace_contract_version)
    AND (NOT v_backend OR nullif(current_setting('pb.marketplace_reconcile_batch', true), '') IS NULL) THEN
    RAISE EXCEPTION 'Perfil legacy ready protegido hasta reconciliacion autorizada.';
  ELSIF NOT v_backend AND (
    NEW.marketplace_contract_version IS DISTINCT FROM OLD.marketplace_contract_version
    OR NEW.marketplace_consent_declared IS DISTINCT FROM OLD.marketplace_consent_declared
    OR NEW.marketplace_consent_version IS DISTINCT FROM OLD.marketplace_consent_version
    OR NEW.marketplace_consent_at IS DISTINCT FROM OLD.marketplace_consent_at
  ) THEN
    RAISE EXCEPTION 'Columnas protegidas: marketplace_contract_version / marketplace_consent_declared / marketplace_consent_version / marketplace_consent_at.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pb_profiles_contract_version_guard() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. Endurecer la sincronización canónica: contrato 3 exige consentimiento v3
--    (PROHIBIDO promover sin consentimiento v3 válido)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pb_sync_marketplace_ready_state(
  p_user_id  uuid,
  p_batch_id text DEFAULT NULL
)
RETURNS TABLE(out_status text, out_marketplace_ready boolean, out_activated_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_profile    record;
  v_completion integer;
  v_pending    integer := 0;
  v_eligible   boolean;
  v_batch      text := coalesce(p_batch_id, 'sync-' || to_char(now(), 'YYYYMMDDHH24MISS'));
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT 'missing_user_id'::text, NULL::boolean, 0;
    RETURN;
  END IF;

  SELECT user_id, full_name, title, marketplace_ready, onboarding_status,
         profile_completion, marketplace_contract_version, marketplace_consent_declared,
         marketplace_consent_version
    INTO v_profile
  FROM public.app_14da0f1941_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'profile_not_found'::text, NULL::boolean, 0;
    RETURN;
  END IF;

  IF v_profile.marketplace_ready IS TRUE THEN
    RETURN QUERY SELECT 'already_ready'::text, TRUE, 0;
    RETURN;
  END IF;

  -- Legacy v1: protegido hasta la reconciliación autorizada (sql/037).
  IF v_profile.marketplace_contract_version = 1 THEN
    RETURN QUERY SELECT 'legacy_protected'::text, FALSE, 0;
    RETURN;
  END IF;

  -- La promoción exige contrato RECONOCIDO (2 o 3) declarado.
  IF v_profile.marketplace_contract_version NOT IN (2, 3) THEN
    RETURN QUERY SELECT 'contract_version_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Consentimiento DECLARADO por el wizard (columna protegida), igual que 045.
  IF v_profile.marketplace_consent_declared IS NOT TRUE THEN
    RETURN QUERY SELECT 'consent_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- PR-V3-02: contrato 3 exige consentimiento VERSIONADO v3. Un perfil con
  -- contract_version=3 sin consent_version=3 (estado inconsistente o
  -- escritura fuera del wizard) no se promueve: outcome explícito.
  IF v_profile.marketplace_contract_version = 3
     AND v_profile.marketplace_consent_version IS DISTINCT FROM 3 THEN
    RETURN QUERY SELECT 'consent_v3_required'::text, FALSE, 0;
    RETURN;
  END IF;

  -- Cada perfil se evalúa con el predicado de SU contrato.
  IF v_profile.marketplace_contract_version = 3 THEN
    v_eligible := public.pb_marketplace_ready_for_v3(p_user_id, TRUE);
  ELSE
    v_eligible := public.pb_marketplace_ready_for(p_user_id, TRUE);
  END IF;

  IF NOT v_eligible THEN
    RETURN QUERY SELECT 'not_eligible'::text, FALSE, 0;
    RETURN;
  END IF;

  v_completion := public.pb_profile_completion_score(p_user_id);

  SELECT count(*) INTO v_pending
  FROM public.app_14da0f1941_job_applications
  WHERE user_id = p_user_id
    AND status = 'pending_profile_validation';

  UPDATE public.app_14da0f1941_profiles
     SET marketplace_ready = TRUE,
         onboarding_status = CASE
           WHEN v_completion >= 30 THEN 'PROFILE_COMPLETED'::text
           ELSE 'ONBOARDING_COMPLETED'::text
         END,
         profile_completion = v_completion
   WHERE user_id = p_user_id;

  -- El trigger de sql/034 activa las candidaturas pending -> applied y crea
  -- el outbox de EMAIL 2 (una fila por transición real). NUNCA sent_to_client.
  RETURN QUERY SELECT 'promoted'::text, TRUE, v_pending;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_sync_marketplace_ready_state(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_sync_marketplace_ready_state(uuid, text) TO service_role;

COMMENT ON FUNCTION public.pb_sync_marketplace_ready_state(uuid, text) IS
  'PR-V3-01/02: sincronización canónica marketplace_ready. Contrato 3 exige consent_version=3 (consent_v3_required). service_role solamente.';

-- =============================================================================
-- 5. RPC del wizard: aceptación del contrato v3 (actor = sujeto por diseño)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pb_accept_marketplace_contract_v3()
RETURNS TABLE(out_status text, out_marketplace_ready boolean, out_activated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_profile     record;
  v_text_version constant text := 'v3-2026-10-17';
BEGIN
  -- Identidad autenticada válida: sin JWT no hay sujeto que acepte.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT user_id, marketplace_ready, marketplace_contract_version,
         marketplace_consent_declared, marketplace_consent_version
    INTO v_profile
  FROM public.app_14da0f1941_profiles
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotencia: aceptación repetida del mismo contrato no duplica evento
  -- ni toca estado. Reintentos del wizard/webhook son seguros.
  IF v_profile.marketplace_contract_version = 3
     AND v_profile.marketplace_consent_declared IS TRUE
     AND v_profile.marketplace_consent_version = 3 THEN
    RETURN QUERY SELECT 'already_accepted'::text, v_profile.marketplace_ready, 0;
    RETURN;
  END IF;

  -- Legacy v1 READY: protegido (misma regla que sql/037). No se migra por el
  -- wizard; requiere reconciliación autorizada.
  IF v_profile.marketplace_contract_version = 1 AND v_profile.marketplace_ready IS TRUE THEN
    RETURN QUERY SELECT 'legacy_protected'::text, TRUE, 0;
    RETURN;
  END IF;

  -- Aceptación: columnas protegidas escritas por vía canónica (esta función
  -- es SECURITY DEFINER y corre como propietario; el guard de sql/037 la
  -- reconoce como backend). El cliente no puede fijarlas directamente.
  UPDATE public.app_14da0f1941_profiles
     SET marketplace_contract_version = 3,
         marketplace_consent_declared = TRUE,
         marketplace_consent_version = 3,
         marketplace_consent_at = now()
   WHERE user_id = v_user_id;

  -- Evidencia append-only del acto (versión del texto mostrado = constante
  -- del servidor; el cliente nunca envía wording).
  INSERT INTO public.app_14da0f1941_marketplace_consent_events
    (user_id, contract_version, consent_text_version, source)
  VALUES
    (v_user_id, 3, v_text_version, 'wizard_v3');

  -- Sincronización canónica: promueve SOLO si el predicado v3 se cumple
  -- (cv, profession, location, availability). Si falta algo, el consentimiento
  -- queda registrado y el usuario completa después (re-sync idempotente por
  -- complete-onboarding / recalculate-profiles). EMAIL 2 solo si hay
  -- transición real false -> true (outbox de sql/034). NUNCA batch: este RPC
  -- procesa exactamente UN usuario, el autenticado.
  RETURN QUERY
    SELECT s.out_status, s.out_marketplace_ready, s.out_activated_count
    FROM public.pb_sync_marketplace_ready_state(v_user_id) s;
END;
$$;

REVOKE ALL ON FUNCTION public.pb_accept_marketplace_contract_v3() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_accept_marketplace_contract_v3() TO authenticated;

COMMENT ON FUNCTION public.pb_accept_marketplace_contract_v3() IS
  'PR-V3-02: aceptación del contrato marketplace v3 por el propio usuario (auth.uid(); sin parámetro de sujeto). Consentimiento versionado (v3-2026-10-17) + auditoría append-only + sincronización canónica. Idempotente (already_accepted). Legacy v1 ready protegido.';
