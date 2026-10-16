-- ══════════════════════════════════════════════════════════════════════════════
-- PB-WHATSAPP-FOUNDATION-001 — PHONE + OTP + CONSENT FOUNDATION
--
-- Base segura para WhatsApp en PIPINGBOX:
--   1) telefono canonico (E.164) en profiles;
--   2) verificacion OTP (challenges con hash, expiracion, intentos);
--   3) consentimiento WhatsApp separado por finalidad
--      (service / job_alerts / marketing), revocable;
--   4) auditoria de eventos NO sensibles con telefono enmascarado;
--   5) outbox de captura para el provider MOCK (solo QA).
--
-- Regla fundamental: phone_present != phone_verified != whatsapp_opt_in.
-- El telefono NO es gate de Marketplace Ready, NO toca el contrato v2 y
-- NO se usa para autorizacion de recursos.
--
-- ─── FUENTE CANONICA ────────────────────────────────────────────────────────
--   public.app_14da0f1941_profiles es la UNICA autoridad para:
--     phone_number_raw, phone_country_code, phone_e164 (canonico, con '+'),
--     phone_present (GENERATED: phone_e164 IS NOT NULL),
--     phone_verified, phone_verified_at, phone_verification_method,
--     whatsapp_service_opt_in, whatsapp_job_alerts_opt_in,
--     whatsapp_marketing_opt_in, whatsapp_consent_at,
--     whatsapp_consent_version, whatsapp_opted_out_at.
--   TODAS son backend-controlled: el cliente las lee por RLS de owner pero
--   NO puede escribirlas (pb_profiles_privilege_guard las protege). Las
--   mutaciones pasan por las Edge Functions phone-send-otp, phone-verify-otp,
--   phone-update-consent y phone-withdraw-consent (service_role + auth.uid).
--
-- ─── CAMBIO DE NUMERO (decision de producto, ticket §7) ─────────────────────
--   Si phone_e164 cambia: phone_verified=false, phone_verified_at=NULL,
--   phone_verification_method=NULL, TODOS los opt-ins a false y
--   whatsapp_opted_out_at=now() (revocacion fechada del consentimiento
--   anterior). Justificacion: el consentimiento se otorgo para una identidad
--   alcanzable (persona + numero); un numero nuevo puede ser otro dispositivo
--   o titular, asi que NO se asume consentimiento heredado y se exige
--   opt-in explicito tras re-verificar. El historico queda en phone_events.
--
-- ─── MODELO DE AMENAZAS / SEGURIDAD ─────────────────────────────────────────
--   * RLS habilitada en las 3 tablas nuevas. Policies SELECT solo owner
--     (user_id = auth.uid()); sin policies de escritura para authenticated/anon.
--   * Grants explicitos: REVOKE ALL a anon/authenticated; SELECT a
--     authenticated solo en verifications y events; ALL a service_role.
--     El outbox del provider mock NO es legible por authenticated/anon.
--   * El OTP NUNCA se almacena en claro en phone_verifications (hash bcrypt).
--     El outbox de captura guarda el codigo porque ES el transporte simulado
--     (equivalente al SMS); solo existe con PHONE_VERIFICATION_PROVIDER=mock,
--     prohibido en produccion (ver DESPLIEGUE/rollback del ticket).
--   * pb_profiles_privilege_guard pasa a proteger tambien las columnas
--     phone_*/whatsapp_* en INSERT (normaliza a defaults) y UPDATE (rechaza).
--     La logica de Marketplace Ready queda byte a byte intacta.
--   * Ningun SECURITY DEFINER nuevo. Sin grants a PUBLIC. Autorizacion nunca
--     derivada de user_metadata.
--   * Auditoria sin PII: phone_masked con formato '+34******678'; jamas el
--     numero completo, jamas el codigo OTP.
--
-- NOTA DE PARIDAD: comentarios dentro de funciones y COMMENT ON sin acentos
-- a proposito (paridad byte a byte entre QA y produccion; ver 036).
--
-- IDEMPOTENTE: IF NOT EXISTS / CREATE OR REPLACE / DO blocks. Reejecutable.
-- ROLLBACK: ver ticket §16 — retirar UI/endpoints conservando datos; el
-- DROP de estas columnas/tablas NO es parte del rollback estandar.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COLUMNAS CANONICAS EN PROFILES
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.app_14da0f1941_profiles
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS phone_country_code text,
  ADD COLUMN IF NOT EXISTS phone_number_raw text,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verification_method text,
  ADD COLUMN IF NOT EXISTS whatsapp_service_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_job_alerts_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_version text,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_out_at timestamptz;

-- phone_present derivado: fuente unica sin riesgo de dessincronizacion.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_14da0f1941_profiles'
      AND column_name = 'phone_present'
  ) THEN
    ALTER TABLE public.app_14da0f1941_profiles
      ADD COLUMN phone_present boolean GENERATED ALWAYS AS (phone_e164 IS NOT NULL) STORED;
  END IF;
END $$;

-- Constraints de formato (paridad con 038, que nunca llego a main/prod).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_profile_phone_e164_format'
                 AND conrelid = 'public.app_14da0f1941_profiles'::regclass) THEN
    ALTER TABLE public.app_14da0f1941_profiles
      ADD CONSTRAINT pb_profile_phone_e164_format
      CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_profile_phone_country_consistency'
                 AND conrelid = 'public.app_14da0f1941_profiles'::regclass) THEN
    ALTER TABLE public.app_14da0f1941_profiles
      ADD CONSTRAINT pb_profile_phone_country_consistency
      CHECK ((phone_e164 IS NULL AND phone_country_code IS NULL)
          OR (phone_e164 IS NOT NULL AND phone_country_code ~ '^[A-Z]{2}$'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_profile_phone_verified_consistency'
                 AND conrelid = 'public.app_14da0f1941_profiles'::regclass) THEN
    ALTER TABLE public.app_14da0f1941_profiles
      ADD CONSTRAINT pb_profile_phone_verified_consistency
      CHECK ((phone_verified = false AND phone_verified_at IS NULL)
          OR (phone_verified = true AND phone_verified_at IS NOT NULL AND phone_e164 IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_profile_whatsapp_optin_requires_phone'
                 AND conrelid = 'public.app_14da0f1941_profiles'::regclass) THEN
    ALTER TABLE public.app_14da0f1941_profiles
      ADD CONSTRAINT pb_profile_whatsapp_optin_requires_phone
      CHECK ((NOT whatsapp_service_opt_in AND NOT whatsapp_job_alerts_opt_in AND NOT whatsapp_marketing_opt_in)
          OR phone_e164 IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.app_14da0f1941_profiles.phone_number_raw IS
  'PB-WHATSAPP-FOUNDATION-001: numero tal como lo escribio el usuario (auditoria/UX). Backend-controlled; la forma canonica es phone_e164.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.phone_e164 IS
  'PB-WHATSAPP-FOUNDATION-001: telefono canonico E.164 con + inicial. Backend-controlled (edge functions phone-*). Presente != verificado != opt-in.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.phone_present IS
  'PB-WHATSAPP-FOUNDATION-001: GENERATED (phone_e164 IS NOT NULL). phone_present != phone_verified != whatsapp opt-in.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.phone_verified IS
  'PB-WHATSAPP-FOUNDATION-001: true solo tras OTP valido. Cambiar phone_e164 lo resetea. No es gate de Marketplace Ready ni autorizacion.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.phone_verification_method IS
  'PB-WHATSAPP-FOUNDATION-001: metodo de la ultima verificacion (ej. sms_otp).';
COMMENT ON COLUMN public.app_14da0f1941_profiles.whatsapp_service_opt_in IS
  'PB-WHATSAPP-FOUNDATION-001: consentimiento notificaciones de servicio por WhatsApp. Requiere telefono verificado. Revocable.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.whatsapp_job_alerts_opt_in IS
  'PB-WHATSAPP-FOUNDATION-001: consentimiento alertas de empleo por WhatsApp. Requiere telefono verificado. Revocable.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.whatsapp_marketing_opt_in IS
  'PB-WHATSAPP-FOUNDATION-001: consentimiento marketing por WhatsApp. Requiere telefono verificado. Revocable.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.whatsapp_consent_at IS
  'PB-WHATSAPP-FOUNDATION-001: timestamp del ultimo cambio de consentimiento WhatsApp.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.whatsapp_consent_version IS
  'PB-WHATSAPP-FOUNDATION-001: version del texto de consentimiento aceptado (ej. wa-consent-v1).';
COMMENT ON COLUMN public.app_14da0f1941_profiles.whatsapp_opted_out_at IS
  'PB-WHATSAPP-FOUNDATION-001: timestamp de la ultima revocacion efectiva (todos los opt-ins a false o cambio/baja de numero).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLA DE CHALLENGES OTP (secretos de verificacion FUERA de profiles)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  otp_code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS app_14da0f1941_phone_verifications_user_created_idx
  ON public.app_14da0f1941_phone_verifications (user_id, created_at DESC);

ALTER TABLE public.app_14da0f1941_phone_verifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'app_14da0f1941_phone_verifications'
                 AND policyname = 'phone_verifications_select_own') THEN
    CREATE POLICY phone_verifications_select_own
      ON public.app_14da0f1941_phone_verifications
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON public.app_14da0f1941_phone_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_14da0f1941_phone_verifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_14da0f1941_phone_verifications TO service_role;

COMMENT ON TABLE public.app_14da0f1941_phone_verifications IS
  'PB-WHATSAPP-FOUNDATION-001: challenges OTP. Hash bcrypt, expiracion corta, max intentos, reenvio invalida el anterior. Escritura solo service_role; owner lee los suyos. Nunca OTP en claro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AUDITORIA DE EVENTOS (sin PII, sin OTP, telefono enmascarado)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_phone_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN (
    'phone_added',
    'phone_changed',
    'verification_started',
    'verification_failed',
    'phone_verified',
    'whatsapp_opt_in_changed'
  )),
  phone_masked text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_14da0f1941_phone_events_user_created_idx
  ON public.app_14da0f1941_phone_events (user_id, created_at DESC);

ALTER TABLE public.app_14da0f1941_phone_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'app_14da0f1941_phone_events'
                 AND policyname = 'phone_events_select_own') THEN
    CREATE POLICY phone_events_select_own
      ON public.app_14da0f1941_phone_events
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON public.app_14da0f1941_phone_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_14da0f1941_phone_events TO authenticated;
GRANT SELECT, INSERT ON public.app_14da0f1941_phone_events TO service_role;

COMMENT ON TABLE public.app_14da0f1941_phone_events IS
  'PB-WHATSAPP-FOUNDATION-001: audit trail no sensible. phone_masked formato +34******678. NUNCA OTP, numero completo ni secretos. Append-only: sin UPDATE/DELETE.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. OUTBOX DE CAPTURA DEL PROVIDER MOCK (SOLO QA)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_phone_provider_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  body text NOT NULL,
  captured_code text,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_14da0f1941_phone_provider_outbox ENABLE ROW LEVEL SECURITY;

-- Sin policies para authenticated/anon: denied por defecto. Solo service_role.
REVOKE ALL ON public.app_14da0f1941_phone_provider_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.app_14da0f1941_phone_provider_outbox TO service_role;

COMMENT ON TABLE public.app_14da0f1941_phone_provider_outbox IS
  'PB-WHATSAPP-FOUNDATION-001: captura del PhoneVerificationProvider MOCK (transporte simulado del SMS; contiene el codigo porque ES el canal). SOLO QA con PHONE_VERIFICATION_PROVIDER=mock; prohibido habilitarlo en produccion. No legible por authenticated/anon.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GUARD DE PRIVILEGIOS: proteger phone_*/whatsapp_* como backend-controlled
--    (la logica de Marketplace Ready queda intacta; se anaden secciones phone)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pb_profiles_privilege_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_privileged boolean;
  v_tampered boolean := false;
BEGIN
  -- Direct database owners/admins are always privileged.
  v_is_privileged := current_user IN ('postgres', 'supabase_admin');

  -- Supabase service_role calls carry 'role' = 'service_role' in request.jwt.claims
  -- even when current_user is 'authenticated' (the JWT is preserved inside the
  -- postgres session via supabase-realtime/auth helpers).
  IF NOT v_is_privileged THEN
    v_is_privileged := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_privileged THEN
      IF NEW.role IN ('admin', 'jobs_moderator') THEN
        RAISE EXCEPTION 'No se permite crear perfil con role=% desde el cliente.', NEW.role;
      END IF;
      IF NEW.account_type = 'admin' THEN
        RAISE EXCEPTION 'No se permite crear perfil con account_type=admin desde el cliente.';
      END IF;

      -- PB-MARKETPLACE-READY-CONSISTENCY-001: columnas canonicas del backend.
      -- El cliente no decide su propio estado de marketplace ni su completitud:
      -- el perfil nace en el escalon mas bajo y solo pb_complete_onboarding /
      -- pb_recalculate_profile_state (service_role) pueden moverlo.
      IF NEW.profile_completion IS DISTINCT FROM 0
         OR NEW.onboarding_status IS DISTINCT FROM 'AUTH_ONLY'
         OR NEW.marketplace_ready IS DISTINCT FROM false
         OR NEW.company_verified IS DISTINCT FROM false
         OR NEW.company_status IS DISTINCT FROM 'pending'
         OR NEW.profile_visibility IS DISTINCT FROM 'private' THEN
        v_tampered := true;
      END IF;

      NEW.profile_completion := 0;
      NEW.onboarding_status  := 'AUTH_ONLY';
      NEW.marketplace_ready  := false;
      NEW.company_verified   := false;
      NEW.company_status     := 'pending';
      -- La visibilidad sigue siendo una eleccion del usuario, pero se declara
      -- DESPUES, por UPDATE del wizard: no en la creacion de la fila.
      NEW.profile_visibility := 'private';

      -- PB-WHATSAPP-FOUNDATION-001: identidad telefonica y consentimiento
      -- WhatsApp son backend-controlled; el perfil nace sin telefono y sin
      -- opt-ins. Solo las edge functions phone-* (service_role) los escriben.
      IF NEW.phone_number_raw IS NOT NULL
         OR NEW.phone_e164 IS NOT NULL
         OR NEW.phone_country_code IS NOT NULL
         OR NEW.phone_verified IS DISTINCT FROM false
         OR NEW.phone_verified_at IS NOT NULL
         OR NEW.phone_verification_method IS NOT NULL
         OR NEW.whatsapp_service_opt_in IS DISTINCT FROM false
         OR NEW.whatsapp_job_alerts_opt_in IS DISTINCT FROM false
         OR NEW.whatsapp_marketing_opt_in IS DISTINCT FROM false
         OR NEW.whatsapp_consent_at IS NOT NULL
         OR NEW.whatsapp_consent_version IS NOT NULL
         OR NEW.whatsapp_opted_out_at IS NOT NULL THEN
        v_tampered := true;
      END IF;

      NEW.phone_number_raw := NULL;
      NEW.phone_e164 := NULL;
      NEW.phone_country_code := NULL;
      NEW.phone_verified := false;
      NEW.phone_verified_at := NULL;
      NEW.phone_verification_method := NULL;
      NEW.whatsapp_service_opt_in := false;
      NEW.whatsapp_job_alerts_opt_in := false;
      NEW.whatsapp_marketing_opt_in := false;
      NEW.whatsapp_consent_at := NULL;
      NEW.whatsapp_consent_version := NULL;
      NEW.whatsapp_opted_out_at := NULL;

      IF v_tampered THEN
        -- Sin PII: solo deja constancia del intento en los logs de Postgres.
        RAISE WARNING 'pb_profiles_privilege_guard: INSERT de cliente con columnas canonicas; normalizadas a defaults seguros.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE below this point.
  IF NOT v_is_privileged THEN
    -- role: never admin/jobs_moderator; only transition from NULL/'user' is allowed.
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NEW.role IN ('admin', 'jobs_moderator') THEN
        RAISE EXCEPTION 'No se permite asignar role=% desde el cliente.', NEW.role;
      END IF;
      IF OLD.role IS NOT NULL AND OLD.role <> 'user' AND OLD.role <> NEW.role THEN
        RAISE EXCEPTION 'No se permite cambiar role desde % a %.', OLD.role, NEW.role;
      END IF;
      IF OLD.role IN ('admin', 'jobs_moderator') THEN
        RAISE EXCEPTION 'No se permite modificar role de administrador desde el cliente.';
      END IF;
    END IF;

    -- account_type: never admin; same transition rules as role.
    IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
      IF NEW.account_type = 'admin' THEN
        RAISE EXCEPTION 'No se permite asignar account_type=admin desde el cliente.';
      END IF;
      IF OLD.account_type IS NOT NULL AND OLD.account_type <> 'user' AND OLD.account_type <> NEW.account_type THEN
        RAISE EXCEPTION 'No se permite cambiar account_type desde % a %.', OLD.account_type, NEW.account_type;
      END IF;
    END IF;

    -- Backend-controlled columns.
    IF NEW.profile_completion IS DISTINCT FROM OLD.profile_completion THEN
      RAISE EXCEPTION 'Columna protegida: profile_completion.';
    END IF;
    IF NEW.marketplace_ready IS DISTINCT FROM OLD.marketplace_ready THEN
      RAISE EXCEPTION 'Columna protegida: marketplace_ready.';
    END IF;
    IF NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status THEN
      RAISE EXCEPTION 'Columna protegida: onboarding_status.';
    END IF;
    IF NEW.company_verified IS DISTINCT FROM OLD.company_verified THEN
      RAISE EXCEPTION 'Columna protegida: company_verified.';
    END IF;
    IF NEW.company_status IS DISTINCT FROM OLD.company_status THEN
      RAISE EXCEPTION 'Columna protegida: company_status.';
    END IF;

    -- PB-WHATSAPP-FOUNDATION-001: telefono canonico, estado de verificacion y
    -- consentimiento WhatsApp solo cambian via edge functions phone-*.
    IF NEW.phone_number_raw IS DISTINCT FROM OLD.phone_number_raw THEN
      RAISE EXCEPTION 'Columna protegida: phone_number_raw.';
    END IF;
    IF NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164 THEN
      RAISE EXCEPTION 'Columna protegida: phone_e164.';
    END IF;
    IF NEW.phone_country_code IS DISTINCT FROM OLD.phone_country_code THEN
      RAISE EXCEPTION 'Columna protegida: phone_country_code.';
    END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
      RAISE EXCEPTION 'Columna protegida: phone_verified.';
    END IF;
    IF NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
      RAISE EXCEPTION 'Columna protegida: phone_verified_at.';
    END IF;
    IF NEW.phone_verification_method IS DISTINCT FROM OLD.phone_verification_method THEN
      RAISE EXCEPTION 'Columna protegida: phone_verification_method.';
    END IF;
    IF NEW.whatsapp_service_opt_in IS DISTINCT FROM OLD.whatsapp_service_opt_in THEN
      RAISE EXCEPTION 'Columna protegida: whatsapp_service_opt_in.';
    END IF;
    IF NEW.whatsapp_job_alerts_opt_in IS DISTINCT FROM OLD.whatsapp_job_alerts_opt_in THEN
      RAISE EXCEPTION 'Columna protegida: whatsapp_job_alerts_opt_in.';
    END IF;
    IF NEW.whatsapp_marketing_opt_in IS DISTINCT FROM OLD.whatsapp_marketing_opt_in THEN
      RAISE EXCEPTION 'Columna protegida: whatsapp_marketing_opt_in.';
    END IF;
    IF NEW.whatsapp_consent_at IS DISTINCT FROM OLD.whatsapp_consent_at THEN
      RAISE EXCEPTION 'Columna protegida: whatsapp_consent_at.';
    END IF;
    IF NEW.whatsapp_consent_version IS DISTINCT FROM OLD.whatsapp_consent_version THEN
      RAISE EXCEPTION 'Columna protegida: whatsapp_consent_version.';
    END IF;
    IF NEW.whatsapp_opted_out_at IS DISTINCT FROM OLD.whatsapp_opted_out_at THEN
      RAISE EXCEPTION 'Columna protegida: whatsapp_opted_out_at.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pb_profiles_privilege_guard() IS 'PB-MARKETPLACE-READY-CONSISTENCY-001 + PB-WHATSAPP-FOUNDATION-001: protege role/account_type, las columnas canonicas del backend y la identidad telefonica/consentimiento WhatsApp en INSERT (normalizando a defaults seguros) y en UPDATE (rechazando el cambio). Privilegiados: postgres, supabase_admin y JWT con role=service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. VERIFICACION POST-DDL (informativa; los advisors de seguridad se
--    ejecutan aparte como parte del QA del ticket)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'app_14da0f1941_profiles' AND (column_name LIKE 'phone%' OR column_name LIKE 'whatsapp%');
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('app_14da0f1941_phone_verifications','app_14da0f1941_phone_events','app_14da0f1941_phone_provider_outbox');
-- SELECT md5(pg_get_functiondef('public.pb_profiles_privilege_guard()'::regprocedure));
