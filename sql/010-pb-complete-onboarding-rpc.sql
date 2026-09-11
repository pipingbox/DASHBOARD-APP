-- ══════════════════════════════════════════════════════════════════════════════
-- PB-COMPLETE-ONBOARDING-404-001 — Hotfix atómico: backend contract para
-- complete-onboarding.
--
-- ROOT CAUSE que resuelve: el workstream PB-MATCHING-NOTIFICATIONS-001 preparó
-- (frontend + edge function + SQL) pero su SQL JAMÁS se aplicó a producción
-- ("DDL/RLS preparado, NO APLICADO"; ticket EXECUTING tras cinco preflights
-- NO-GO). Las piezas de frontend SÍ llegaron a producción con los deploys
-- normales de la app, dejando el wizard llamando a una edge function que no
-- existe (404) que, de existir, invocaría un RPC que tampoco existe (500).
-- Resultado: ningún usuario puede finalizar canónicamente el onboarding.
--
-- SOURCE OF TRUTH (decisión autorizada por el PO, 2026-09-11):
--   La semántica canónica del trío (profile_completion, onboarding_status,
--   marketplace_ready) es la de la edge function DESPLEGADA
--   `recalculate-profiles` (v9, consent-aware). Este RPC es un PUERTO EXACTO
--   de esa semántica a SQL: mismos pesos, mismo umbral (30), mismo predicado
--   de consentimiento, misma escalera de estados. NO existe una segunda
--   lógica: cualquier cambio futuro en la fórmula debe hacerse en ambos
--   caminos a la vez (o unificarlos llamando recalculate-profiles a este RPC).
--
--   El parámetro p_marketplace_ready (enviado por el wizard desde la elección
--   de visibilidad del paso 7) actúa como compuerta AND adicional de
--   consentimiento: publicación = p_marketplace_ready AND consentimiento_leído
--  _del_perfil AND completion >= 30. Nunca se infiere publicación únicamente
--   por completion.
--
-- MODELO DE AMENAZAS / SEGURIDAD:
--   * SECURITY INVOKER (no SECURITY DEFINER): el RPC se ejecuta con los
--     privilegios del llamador. Solo el backend (service_role, vía la edge
--     function complete-onboarding con JWT verificado) tiene EXECUTE.
--   * La edge function deriva p_user_id EXCLUSIVAMENTE del JWT verificado;
--     un usuario no puede completar el onboarding de otro.
--   * REVOKE a PUBLIC/anon/authenticated: sin EXECUTE desde la API pública.
--   * search_path fijado a public (previene hijacking de funciones).
--   * Actúa solo sobre la fila de p_user_id y exige exactamente una fila
--     afectada; perfil inexistente => excepción.
--   * El trigger pb_profiles_update_guard permite la modificación del trío a
--     service_role, que es el rol con el que corre este RPC desde la edge
--     function. No se toca el trigger ni las policies.
--
-- APLICACIÓN: conforme al protocolo SQL (revisión + autorización ya concedidas
-- por el PO para este hotfix). Idempotente (CREATE OR REPLACE + grants).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pb_complete_onboarding(
  p_user_id uuid,
  p_marketplace_ready boolean DEFAULT false
)
RETURNS TABLE(
  onboarding_status text,
  marketplace_ready boolean,
  profile_completion integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_full_name             public.app_14da0f1941_profiles.full_name%TYPE;
  v_title                 public.app_14da0f1941_profiles.title%TYPE;
  v_company               public.app_14da0f1941_profiles.company%TYPE;
  v_location              public.app_14da0f1941_profiles.location%TYPE;
  v_years_experience      public.app_14da0f1941_profiles.years_experience%TYPE;
  v_skills                public.app_14da0f1941_profiles.skills%TYPE;
  v_bio                   public.app_14da0f1941_profiles.bio%TYPE;
  v_avatar_url            public.app_14da0f1941_profiles.avatar_url%TYPE;
  v_cv_storage_bucket     public.app_14da0f1941_profiles.cv_storage_bucket%TYPE;
  v_cv_storage_path       public.app_14da0f1941_profiles.cv_storage_path%TYPE;
  v_cv_file_url           public.app_14da0f1941_profiles.cv_file_url%TYPE;
  v_cv_url                public.app_14da0f1941_profiles.cv_url%TYPE;
  v_profile_visibility    public.app_14da0f1941_profiles.profile_visibility%TYPE;
  v_cv_visible            public.app_14da0f1941_profiles.cv_visible%TYPE;
  v_exp_count             integer;
  v_cert_count            integer;
  v_doc_count             integer;
  v_completion            integer := 0;
  v_consents              boolean;
  v_marketplace_ready     boolean;
  v_status                text;
  v_rows                  integer;
BEGIN
  -- Perfil objetivo: exclusivamente el user_id recibido (el backend lo deriva
  -- del JWT verificado en la edge function).
  SELECT full_name, title, company, location, years_experience, skills, bio,
         avatar_url, cv_storage_bucket, cv_storage_path, cv_file_url, cv_url,
         profile_visibility, cv_visible
    INTO v_full_name, v_title, v_company, v_location, v_years_experience,
         v_skills, v_bio, v_avatar_url, v_cv_storage_bucket, v_cv_storage_path,
         v_cv_file_url, v_cv_url, v_profile_visibility, v_cv_visible
  FROM public.app_14da0f1941_profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT count(*) INTO v_exp_count
  FROM public.app_worker_experiences WHERE user_id = p_user_id;
  SELECT count(*) INTO v_cert_count
  FROM public.app_worker_certifications WHERE user_id = p_user_id;
  SELECT count(*) INTO v_doc_count
  FROM public.app_worker_documents WHERE user_id = p_user_id;

  -- ── PUERTO EXACTO de recalculate-profiles.calculateCompletion() ──────────
  -- Photo 10 · Full Name 5 · Title 5 · Company 5 · Location 5 · Years 5
  -- Skills 10 · Bio 10 · CV 15 · Experience 15 · Certification 10 · Docs 5
  IF v_avatar_url IS NOT NULL AND btrim(v_avatar_url) <> '' THEN
    v_completion := v_completion + 10;
  END IF;
  IF v_full_name IS NOT NULL AND btrim(v_full_name) <> '' THEN
    v_completion := v_completion + 5;
  END IF;
  IF v_title IS NOT NULL AND btrim(v_title) <> '' THEN
    v_completion := v_completion + 5;
  END IF;
  IF v_company IS NOT NULL AND btrim(v_company) <> '' THEN
    v_completion := v_completion + 5;
  END IF;
  IF v_location IS NOT NULL AND btrim(v_location) <> '' THEN
    v_completion := v_completion + 5;
  END IF;
  IF v_years_experience IS NOT NULL AND v_years_experience > 0 THEN
    v_completion := v_completion + 5;
  END IF;
  IF v_skills IS NOT NULL AND array_length(v_skills, 1) > 0 THEN
    v_completion := v_completion + 10;
  END IF;
  IF v_bio IS NOT NULL AND length(btrim(v_bio)) > 10 THEN
    v_completion := v_completion + 10;
  END IF;
  -- hasCv(): canonical cv_storage_bucket+cv_storage_path, con cv_file_url y
  -- cv_url (enlace externo del usuario) como fallbacks vigentes.
  IF (v_cv_storage_bucket IS NOT NULL AND v_cv_storage_path IS NOT NULL)
     OR v_cv_file_url IS NOT NULL
     OR v_cv_url IS NOT NULL THEN
    v_completion := v_completion + 15;
  END IF;
  IF v_exp_count > 0 THEN
    v_completion := v_completion + 15;
  END IF;
  IF v_cert_count > 0 THEN
    v_completion := v_completion + 10;
  END IF;
  IF v_doc_count > 0 THEN
    v_completion := v_completion + 5;
  END IF;

  -- ── PUERTO EXACTO de consentsToMarketplace(), con la compuerta AND del
  --    consentimiento declarado por el wizard (p_marketplace_ready) ─────────
  v_consents := p_marketplace_ready AND (
    (v_profile_visibility = 'public')
    OR (v_profile_visibility IS NULL AND v_cv_visible IS TRUE)
  );

  -- Publication nunca se infiere únicamente por completion:
  v_marketplace_ready := v_consents AND v_completion >= 30;

  -- ── PUERTO EXACTO de getOnboardingStatus() ───────────────────────────────
  IF v_completion >= 30 THEN
    v_status := CASE WHEN v_marketplace_ready THEN 'MARKETPLACE_READY'
                     ELSE 'PROFILE_COMPLETED' END;
  ELSIF v_full_name IS NOT NULL AND btrim(v_full_name) <> ''
        AND v_title IS NOT NULL AND btrim(v_title) <> '' THEN
    v_status := 'PROFILE_STARTED';
  ELSE
    v_status := 'AUTH_ONLY';
  END IF;

  UPDATE public.app_14da0f1941_profiles
  SET onboarding_status  = v_status,
      marketplace_ready  = v_marketplace_ready,
      profile_completion = v_completion,
      updated_at         = now()
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'expected_exactly_one_profile_row_updated';
  END IF;

  RETURN QUERY SELECT v_status, v_marketplace_ready, v_completion;
END $$;

-- ── Grants mínimos: SOLO el backend. Sin EXECUTE desde la API pública. ──────
REVOKE ALL ON FUNCTION public.pb_complete_onboarding(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_complete_onboarding(uuid, boolean)
  TO service_role;

-- ── Verificación post-aplicación (ejecutar y esperar exactamente estos
--    resultados; cualquier desviación aborta el despliegue de la edge
--    function):
--    1) SELECT proname, prosecdef, proconfig FROM pg_proc
--       WHERE oid = 'public.pb_complete_onboarding(uuid, boolean)'::regprocedure;
--       -> prosecdef = false (INVOKER); proconfig = {search_path=public}
--    2) SELECT grantee, privilege_type FROM information_schema.routine_privileges
--       WHERE routine_name = 'pb_complete_onboarding';
--       -> únicamente service_role / EXECUTE
--    3) Con JWT del propietario: POST /functions/v1/complete-onboarding tras
--       desplegarla (verificación 401/200/ownership del protocolo).
