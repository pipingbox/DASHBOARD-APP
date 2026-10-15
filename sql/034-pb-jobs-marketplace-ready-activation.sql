-- ══════════════════════════════════════════════════════════════════════════════
-- PB-JOBS-MARKETPLACE-READY-ACTIVATION-001
--
-- Flujo obligatorio para candidaturas de usuarios sin marketplace_ready.
--
-- PRODUCTO
--   1. Un usuario puede aplicar aunque marketplace_ready = false.
--   2. Si aplica en ese estado, la candidatura nace como
--      'pending_profile_validation' (no presentable al cliente, visible para
--      el usuario, no bloquea nuevas candidaturas).
--   3. En la transición real marketplace_ready false -> true:
--      - todas sus candidaturas 'pending_profile_validation' pasan a
--        'applied' (= ready_for_review; NUNCA a 'sent_to_client'),
--      - se registra una fila de outbox por transición efectiva para el
--        email "Marketplace Ready alcanzado" (una sola por transición).
--   4. Idempotencia de emails vía claim tables (patrón sql/030e/030f de
--      PB-I18N-EMAIL-001: reclamo atómico, fase de entrega pre_send /
--      send_started, estados terminal/ambiguous, máx. intentos).
--
-- ESTADOS REUTILIZADOS (sin taxonomía paralela)
--   job_applications.status:
--     'applied'                    → ready_for_review (revisable/presentable)
--     'pending_profile_validation' → NUEVO único estado añadido
--     'sent_to_client' y resto     → sin cambios
--   app_14da0f1941_job_application_events: auditoría de cada transición
--   (application_created / application_pending_profile_validation /
--    application_ready_for_review son distinguibles en backend).
--
-- SEGURIDAD
--   - Nuevas tablas con RLS ENABLED y SIN políticas: solo service_role
--     (via RPCs SECURITY DEFINER con GRANT solo a service_role) puede
--     reclamar/finalizar envíos. anon/authenticated no reciben EXECUTE.
--   - app_update_application_status: 'sent_to_client' exige que el perfil
--     del candidato sea marketplace_ready (fail-closed backend), y solo
--     admin/jobs_moderator puede fijar 'pending_profile_validation'.
--   - El estado inicial lo decide un trigger BEFORE INSERT leyendo
--     profiles.marketplace_ready (columna protegida por
--     profiles_privilege_guard): el cliente no puede falsificarlo.
--
-- ORDEN: después de 033a. Idempotente (CREATE OR REPLACE / IF NOT EXISTS).
-- ROLLBACK: ver sección final.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Trigger BEFORE INSERT: estado inicial canónico según marketplace_ready
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_14da0f1941_set_application_initial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ready boolean;
BEGIN
  -- Fuente canónica: profiles.marketplace_ready (columna protegida, no
  -- escribible desde el cliente). Sin fila de perfil se trata como "no
  -- ready" (fail-closed): la candidatura se conserva, pero no es presentable.
  SELECT p.marketplace_ready INTO v_ready
  FROM public.app_14da0f1941_profiles p
  WHERE p.user_id = NEW.user_id;

  IF v_ready IS NOT TRUE THEN
    NEW.status := 'pending_profile_validation';
  ELSIF NEW.status = 'pending_profile_validation' THEN
    -- Anti-falsificación: un cliente no puede auto-marcar su candidatura
    -- como pendiente cuando su perfil ya está validado.
    NEW.status := 'applied';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_set_application_initial_status() IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: estado inicial de candidatura según profiles.marketplace_ready (fail-closed).';

DROP TRIGGER IF EXISTS app_14da0f1941_job_applications_initial_status ON public.app_14da0f1941_job_applications;
CREATE TRIGGER app_14da0f1941_job_applications_initial_status
  BEFORE INSERT ON public.app_14da0f1941_job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.app_14da0f1941_set_application_initial_status();

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Trigger AFTER INSERT: auditoría del nacimiento pending (analytics)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_14da0f1941_log_application_initial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'pending_profile_validation' THEN
    INSERT INTO public.app_14da0f1941_job_application_events
      (application_id, from_status, to_status, actor_user_id, actor_role, note)
    VALUES
      (NEW.id, NULL, 'pending_profile_validation', NULL, 'system',
       'initial status: profile not marketplace_ready');
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_log_application_initial_status() IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: evento de auditoría del alta pending_profile_validation.';

DROP TRIGGER IF EXISTS app_14da0f1941_job_applications_log_initial ON public.app_14da0f1941_job_applications;
CREATE TRIGGER app_14da0f1941_job_applications_log_initial
  AFTER INSERT ON public.app_14da0f1941_job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.app_14da0f1941_log_application_initial_status();

CREATE INDEX IF NOT EXISTS job_applications_user_status_idx
  ON public.app_14da0f1941_job_applications (user_id, status);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Outbox EMAIL 2: una fila por transición efectiva false -> true
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_marketplace_ready_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activated_count integer NOT NULL DEFAULT 0,
  activated_job_titles text[] NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','claimed','sent','ambiguous','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  claim_id uuid,
  delivery_phase text CHECK (delivery_phase IN ('pre_send','send_started')),
  lease_expires_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_14da0f1941_marketplace_ready_activations IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: outbox del email "Marketplace Ready alcanzado". Una fila por transición efectiva false->true (trigger). state=''sent'' = email enviado; ''skipped'' = transición sin candidaturas que activar.';

CREATE INDEX IF NOT EXISTS marketplace_ready_activations_user_state_idx
  ON public.app_14da0f1941_marketplace_ready_activations (user_id, state, created_at);

ALTER TABLE public.app_14da0f1941_marketplace_ready_activations ENABLE ROW LEVEL SECURITY;
-- Sin políticas: ni anon ni authenticated leen/escriben. Solo service_role
-- (SELECT directo) y las RPCs SECURITY DEFINER de esta migración.
REVOKE ALL ON TABLE public.app_14da0f1941_marketplace_ready_activations FROM PUBLIC;
REVOKE ALL ON TABLE public.app_14da0f1941_marketplace_ready_activations FROM anon;
REVOKE ALL ON TABLE public.app_14da0f1941_marketplace_ready_activations FROM authenticated;
GRANT SELECT ON TABLE public.app_14da0f1941_marketplace_ready_activations TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Claim EMAIL 1: una fila por application (idempotencia anti-reintentos)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_job_application_profile_pending_emails (
  application_id uuid PRIMARY KEY
    REFERENCES public.app_14da0f1941_job_applications(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','claimed','sent','ambiguous','failed')),
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  lease_expires_at timestamptz NOT NULL DEFAULT now(),
  claim_id uuid,
  delivery_phase text CHECK (delivery_phase IN ('pre_send','send_started')),
  sent_at timestamptz,
  message_id text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_14da0f1941_job_application_profile_pending_emails IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: claim de idempotencia del email "Candidatura recibida — completa tu perfil". PK = application_id: una candidatura no puede generar dos emails.';

ALTER TABLE public.app_14da0f1941_job_application_profile_pending_emails ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service_role (SELECT) y RPCs SECURITY DEFINER.
REVOKE ALL ON TABLE public.app_14da0f1941_job_application_profile_pending_emails FROM PUBLIC;
REVOKE ALL ON TABLE public.app_14da0f1941_job_application_profile_pending_emails FROM anon;
REVOKE ALL ON TABLE public.app_14da0f1941_job_application_profile_pending_emails FROM authenticated;
GRANT SELECT ON TABLE public.app_14da0f1941_job_application_profile_pending_emails TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Trigger transición marketplace_ready: activar candidaturas + outbox
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_14da0f1941_on_marketplace_ready_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app record;
  v_count integer := 0;
  v_titles text[] := ARRAY[]::text[];
BEGIN
  -- Solo la transición EFECTIVA false -> true dispara el flujo. Updates
  -- posteriores con true -> true no vuelven a ejecutar nada (EMAIL 2 se
  -- envía una sola vez por transición).
  IF OLD.marketplace_ready IS NOT TRUE AND NEW.marketplace_ready IS TRUE THEN
    FOR v_app IN
      SELECT a.id, a.job_title
      FROM public.app_14da0f1941_job_applications a
      WHERE a.user_id = NEW.user_id
        AND a.status = 'pending_profile_validation'
      FOR UPDATE
    LOOP
      UPDATE public.app_14da0f1941_job_applications
      SET status = 'applied'
      WHERE id = v_app.id;

      INSERT INTO public.app_14da0f1941_job_application_events
        (application_id, from_status, to_status, actor_user_id, actor_role, note)
      VALUES
        (v_app.id, 'pending_profile_validation', 'applied', NULL, 'system',
         'marketplace_ready reached: ready_for_review');

      v_count := v_count + 1;
      IF coalesce(array_length(v_titles, 1), 0) < 10 THEN
        v_titles := array_append(v_titles, coalesce(v_app.job_title, ''));
      END IF;
    END LOOP;

    -- Una fila de outbox por transición (también con 0 candidaturas: la
    -- transición queda auditada como 'skipped' y sin email).
    INSERT INTO public.app_14da0f1941_marketplace_ready_activations
      (user_id, activated_count, activated_job_titles, state, attempts, lease_expires_at)
    VALUES
      (NEW.user_id, v_count, v_titles, 'pending', 0, now());
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_on_marketplace_ready_transition() IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: en false->true activa candidaturas pending a applied (ready_for_review, nunca sent_to_client) y encola el email de validación (outbox).';

DROP TRIGGER IF EXISTS app_14da0f1941_profiles_marketplace_ready_activation ON public.app_14da0f1941_profiles;
CREATE TRIGGER app_14da0f1941_profiles_marketplace_ready_activation
  AFTER UPDATE OF marketplace_ready ON public.app_14da0f1941_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.app_14da0f1941_on_marketplace_ready_transition();

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. RPCs de claim / fase / finalize — EMAIL 1 (patrón 030e/030f, col. calificadas)
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.app_14da0f1941_claim_application_profile_pending_email(uuid, integer, integer);
CREATE FUNCTION public.app_14da0f1941_claim_application_profile_pending_email(
  p_application_id uuid,
  p_max_attempts   integer DEFAULT 3,
  p_lease_seconds  integer DEFAULT 120
)
RETURNS TABLE (claimed boolean, state text, attempts integer, reason text, claim_id uuid, delivery_phase text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_job_application_profile_pending_emails;
  v_now timestamptz := now();
BEGIN
  IF p_application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'missing_application_id', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Paso A (transición segura): 'ambiguous' para reclamos caducados cuya
  -- fase es 'send_started' o desconocida (transmisión posible, no demostrada).
  UPDATE public.app_14da0f1941_job_application_profile_pending_emails
    SET state = 'ambiguous',
        last_error = 'lease_expired_after_send_started_or_unknown_phase',
        updated_at = v_now
  WHERE application_id = p_application_id
    AND public.app_14da0f1941_job_application_profile_pending_emails.state = 'claimed'
    AND lease_expires_at < v_now
    AND public.app_14da0f1941_job_application_profile_pending_emails.delivery_phase IS DISTINCT FROM 'pre_send';

  -- Paso B: reclamo atómico. Insert nueva o reclaims de 'failed'/'claimed'
  -- caducados en fase 'pre_send' (no-transmisión demostrada).
  INSERT INTO public.app_14da0f1941_job_application_profile_pending_emails
    (application_id, state, attempts, claimed_at, lease_expires_at, updated_at, claim_id, delivery_phase)
  VALUES
    (p_application_id, 'claimed', 1, v_now, v_now + make_interval(secs => p_lease_seconds), v_now, gen_random_uuid(), 'pre_send')
  ON CONFLICT (application_id) DO UPDATE
    SET state            = 'claimed',
        attempts         = public.app_14da0f1941_job_application_profile_pending_emails.attempts + 1,
        claimed_at       = v_now,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        last_error       = NULL,
        updated_at       = v_now,
        claim_id         = gen_random_uuid(),
        delivery_phase   = 'pre_send'
    WHERE
      (
        public.app_14da0f1941_job_application_profile_pending_emails.state = 'failed'
        OR (
          public.app_14da0f1941_job_application_profile_pending_emails.state = 'claimed'
          AND public.app_14da0f1941_job_application_profile_pending_emails.lease_expires_at < v_now
          AND public.app_14da0f1941_job_application_profile_pending_emails.delivery_phase = 'pre_send'
        )
      )
      AND public.app_14da0f1941_job_application_profile_pending_emails.attempts < p_max_attempts
  RETURNING * INTO v_row;

  IF v_row.application_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_row.state, v_row.attempts, 'claimed'::text, v_row.claim_id, v_row.delivery_phase;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.app_14da0f1941_job_application_profile_pending_emails
  WHERE application_id = p_application_id;

  IF v_row.application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'unknown_application', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    false,
    v_row.state,
    v_row.attempts,
    CASE
      WHEN v_row.state = 'sent'      THEN 'already_sent'
      WHEN v_row.state = 'ambiguous' THEN 'ambiguous_requires_manual_review'
      WHEN v_row.state = 'claimed'   THEN 'in_progress_elsewhere'
      WHEN v_row.attempts >= p_max_attempts THEN 'max_attempts_exhausted'
      ELSE 'not_claimable'
    END::text,
    NULL::uuid,
    v_row.delivery_phase;

EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'unknown_application'::text, NULL::uuid, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_claim_application_profile_pending_email(uuid, integer, integer) IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: reclamo atómico del email de perfil incompleto (idempotente anti-reintentos).';

DROP FUNCTION IF EXISTS public.app_14da0f1941_marc_application_profile_pending_email_phase(uuid, uuid, text);
CREATE FUNCTION public.app_14da0f1941_marc_application_profile_pending_email_phase(
  p_application_id uuid,
  p_claim_id       uuid,
  p_phase          text
)
RETURNS TABLE (marked boolean, delivery_phase text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_job_application_profile_pending_emails;
BEGIN
  IF p_application_id IS NULL OR p_claim_id IS NULL
     OR p_phase NOT IN ('pre_send', 'send_started') THEN
    RETURN QUERY SELECT false, NULL::text, 'invalid_arguments'::text;
    RETURN;
  END IF;

  UPDATE public.app_14da0f1941_job_application_profile_pending_emails
  SET delivery_phase = p_phase,
      updated_at = now()
  WHERE application_id = p_application_id
    AND claim_id = p_claim_id
    AND public.app_14da0f1941_job_application_profile_pending_emails.state = 'claimed'
  RETURNING * INTO v_row;

  IF v_row.application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'claim_not_found_or_not_claimed'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.delivery_phase, 'marked'::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_marc_application_profile_pending_email_phase(uuid, uuid, text) IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: marca pre_send/send_started del email de perfil incompleto.';

DROP FUNCTION IF EXISTS public.app_14da0f1941_finalize_application_profile_pending_email(uuid, uuid, text, text, text);
CREATE FUNCTION public.app_14da0f1941_finalize_application_profile_pending_email(
  p_application_id uuid,
  p_claim_id       uuid,
  p_outcome        text,
  p_message_id     text DEFAULT NULL,
  p_last_error     text DEFAULT NULL
)
RETURNS TABLE (finalized boolean, state text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_job_application_profile_pending_emails;
  v_state text;
BEGIN
  IF p_application_id IS NULL OR p_claim_id IS NULL
     OR p_outcome NOT IN ('sent', 'failed', 'ambiguous') THEN
    RETURN QUERY SELECT false, NULL::text, 'invalid_arguments'::text;
    RETURN;
  END IF;

  v_state := CASE p_outcome
    WHEN 'sent'      THEN 'sent'
    WHEN 'failed'    THEN 'failed'
    WHEN 'ambiguous' THEN 'ambiguous'
  END;

  UPDATE public.app_14da0f1941_job_application_profile_pending_emails
  SET state       = v_state,
      sent_at     = CASE WHEN p_outcome = 'sent' THEN now() ELSE sent_at END,
      message_id  = CASE WHEN p_outcome = 'sent' THEN p_message_id ELSE message_id END,
      last_error  = CASE WHEN p_outcome = 'sent' THEN NULL ELSE p_last_error END,
      updated_at  = now()
  WHERE application_id = p_application_id
    AND claim_id = p_claim_id
    AND public.app_14da0f1941_job_application_profile_pending_emails.state = 'claimed'
  RETURNING * INTO v_row;

  IF v_row.application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'claim_not_found_or_not_claimed'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.state, 'finalized'::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_finalize_application_profile_pending_email(uuid, uuid, text, text, text) IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: finaliza el envío del email de perfil incompleto (sent/failed/ambiguous).';

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. RPCs de claim / fase / finalize — EMAIL 2 (outbox marketplace ready)
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.app_14da0f1941_claim_marketplace_ready_activation(uuid, integer, integer);
CREATE FUNCTION public.app_14da0f1941_claim_marketplace_ready_activation(
  p_activation_id uuid,
  p_max_attempts  integer DEFAULT 3,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (claimed boolean, state text, attempts integer, reason text, claim_id uuid, delivery_phase text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_marketplace_ready_activations;
  v_now timestamptz := now();
BEGIN
  IF p_activation_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'missing_activation_id', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.app_14da0f1941_marketplace_ready_activations
    WHERE id = p_activation_id
  ) THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'unknown_activation', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Paso A: caducados post-send_started → ambiguous (no reenviar).
  UPDATE public.app_14da0f1941_marketplace_ready_activations
    SET state = 'ambiguous',
        last_error = 'lease_expired_after_send_started_or_unknown_phase',
        updated_at = v_now
  WHERE id = p_activation_id
    AND public.app_14da0f1941_marketplace_ready_activations.state = 'claimed'
    AND lease_expires_at < v_now
    AND public.app_14da0f1941_marketplace_ready_activations.delivery_phase IS DISTINCT FROM 'pre_send';

  -- Paso B: reclamo atómico.
  UPDATE public.app_14da0f1941_marketplace_ready_activations
  SET state            = 'claimed',
      attempts         = public.app_14da0f1941_marketplace_ready_activations.attempts + 1,
      claim_id         = gen_random_uuid(),
      delivery_phase   = 'pre_send',
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      last_error       = NULL,
      updated_at       = v_now
  WHERE id = p_activation_id
    AND (
      public.app_14da0f1941_marketplace_ready_activations.state IN ('pending', 'failed')
      OR (
        public.app_14da0f1941_marketplace_ready_activations.state = 'claimed'
        AND public.app_14da0f1941_marketplace_ready_activations.lease_expires_at < v_now
        AND public.app_14da0f1941_marketplace_ready_activations.delivery_phase = 'pre_send'
      )
    )
    AND public.app_14da0f1941_marketplace_ready_activations.attempts < p_max_attempts
  RETURNING * INTO v_row;

  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_row.state, v_row.attempts, 'claimed'::text, v_row.claim_id, v_row.delivery_phase;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.app_14da0f1941_marketplace_ready_activations
  WHERE id = p_activation_id;

  RETURN QUERY SELECT
    false,
    v_row.state,
    v_row.attempts,
    CASE
      WHEN v_row.state = 'sent'      THEN 'already_sent'
      WHEN v_row.state = 'ambiguous' THEN 'ambiguous_requires_manual_review'
      WHEN v_row.state = 'skipped'   THEN 'skipped_no_applications'
      WHEN v_row.state = 'claimed'   THEN 'in_progress_elsewhere'
      WHEN v_row.state = 'pending'   THEN 'not_yet_claimable'
      WHEN v_row.attempts >= p_max_attempts THEN 'max_attempts_exhausted'
      ELSE 'not_claimable'
    END::text,
    NULL::uuid,
    v_row.delivery_phase;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_claim_marketplace_ready_activation(uuid, integer, integer) IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: reclamo atómico del email "Marketplace Ready alcanzado" (una sola vez por transición).';

DROP FUNCTION IF EXISTS public.app_14da0f1941_marc_marketplace_ready_activation_phase(uuid, uuid, text);
CREATE FUNCTION public.app_14da0f1941_marc_marketplace_ready_activation_phase(
  p_activation_id uuid,
  p_claim_id      uuid,
  p_phase         text
)
RETURNS TABLE (marked boolean, delivery_phase text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_marketplace_ready_activations;
BEGIN
  IF p_activation_id IS NULL OR p_claim_id IS NULL
     OR p_phase NOT IN ('pre_send', 'send_started') THEN
    RETURN QUERY SELECT false, NULL::text, 'invalid_arguments'::text;
    RETURN;
  END IF;

  UPDATE public.app_14da0f1941_marketplace_ready_activations
  SET delivery_phase = p_phase,
      updated_at = now()
  WHERE id = p_activation_id
    AND claim_id = p_claim_id
    AND public.app_14da0f1941_marketplace_ready_activations.state = 'claimed'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'claim_not_found_or_not_claimed'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.delivery_phase, 'marked'::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_marc_marketplace_ready_activation_phase(uuid, uuid, text) IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: marca pre_send/send_started del email de Marketplace Ready.';

DROP FUNCTION IF EXISTS public.app_14da0f1941_finalize_marketplace_ready_activation(uuid, uuid, text, text, text);
CREATE FUNCTION public.app_14da0f1941_finalize_marketplace_ready_activation(
  p_activation_id uuid,
  p_claim_id      uuid,
  p_outcome       text,
  p_message_id    text DEFAULT NULL,
  p_last_error    text DEFAULT NULL
)
RETURNS TABLE (finalized boolean, state text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_marketplace_ready_activations;
  v_state text;
BEGIN
  IF p_activation_id IS NULL OR p_claim_id IS NULL
     OR p_outcome NOT IN ('sent', 'failed', 'ambiguous', 'skipped') THEN
    RETURN QUERY SELECT false, NULL::text, 'invalid_arguments'::text;
    RETURN;
  END IF;

  v_state := CASE p_outcome
    WHEN 'sent'      THEN 'sent'
    WHEN 'failed'    THEN 'failed'
    WHEN 'ambiguous' THEN 'ambiguous'
    WHEN 'skipped'   THEN 'skipped'
  END;

  UPDATE public.app_14da0f1941_marketplace_ready_activations
  SET state       = v_state,
      sent_at     = CASE WHEN p_outcome = 'sent' THEN now() ELSE sent_at END,
      message_id  = CASE WHEN p_outcome = 'sent' THEN p_message_id ELSE message_id END,
      last_error  = CASE WHEN p_outcome = 'sent' THEN NULL
                         WHEN p_outcome = 'skipped' THEN 'no_pending_applications_at_transition'
                         ELSE p_last_error END,
      updated_at  = now()
  WHERE id = p_activation_id
    AND claim_id = p_claim_id
    AND public.app_14da0f1941_marketplace_ready_activations.state = 'claimed'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'claim_not_found_or_not_claimed'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.state, 'finalized'::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_finalize_marketplace_ready_activation(uuid, uuid, text, text, text) IS
  'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: finaliza el envío del email de Marketplace Ready (sent/failed/ambiguous/skipped).';

-- GRANTs: SOLO service_role. anon/authenticated no obtienen EXECUTE.
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_application_profile_pending_email(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_application_profile_pending_email(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_application_profile_pending_email(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_claim_application_profile_pending_email(uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_application_profile_pending_email_phase(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_application_profile_pending_email_phase(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_application_profile_pending_email_phase(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_marc_application_profile_pending_email_phase(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_application_profile_pending_email(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_application_profile_pending_email(uuid, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_application_profile_pending_email(uuid, uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_finalize_application_profile_pending_email(uuid, uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_marketplace_ready_activation(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_marketplace_ready_activation(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_marketplace_ready_activation(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_claim_marketplace_ready_activation(uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_marketplace_ready_activation_phase(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_marketplace_ready_activation_phase(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_marketplace_ready_activation_phase(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_marc_marketplace_ready_activation_phase(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_marketplace_ready_activation(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_marketplace_ready_activation(uuid, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_marketplace_ready_activation(uuid, uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_finalize_marketplace_ready_activation(uuid, uuid, text, text, text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. app_update_application_status: reglas del nuevo estado (fail-closed)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_update_application_status(
  p_application_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_app app_14da0f1941_job_applications%ROWTYPE;
  v_allowed text[] := ARRAY[
    'applied','reviewed','shortlisted','sent_to_client','interview',
    'hired','rejected','withdrawn','pending_profile_validation'
  ];
  v_terminal text[] := ARRAY['hired','rejected','withdrawn'];
  v_applicant_ready boolean;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT (p_new_status = ANY (v_allowed)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT role INTO v_role
  FROM app_14da0f1941_profiles
  WHERE user_id = v_actor;

  SELECT * INTO v_app
  FROM app_14da0f1941_job_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Authorization: admin (role or primary admin email), jobs_moderator,
  -- or the company that owns the application. Workers can only withdraw
  -- their own application.
  IF NOT (
    v_role IN ('admin', 'jobs_moderator')
    OR (auth.jwt() ->> 'email') = 'gaspardelhierromata@gmail.com'
    OR v_app.company_user_id = v_actor
    OR (v_app.user_id = v_actor AND p_new_status = 'withdrawn')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- PB-JOBS-MARKETPLACE-READY-ACTIVATION-001:
  -- 'pending_profile_validation' es un estado interno del sistema; solo
  -- admin/jobs_moderator puede fijarlo manualmente (correcciones).
  IF p_new_status = 'pending_profile_validation'
     AND v_role NOT IN ('admin', 'jobs_moderator')
     AND (auth.jwt() ->> 'email') <> 'gaspardelhierromata@gmail.com' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Idempotency: already in target status → success, no duplicate event.
  IF v_app.status = p_new_status THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', p_new_status);
  END IF;

  -- Reopening from a terminal state requires an explicit reason.
  IF v_app.status = ANY (v_terminal) AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_required_for_reopen');
  END IF;

  -- Presentar al cliente exige perfil validado (fuente canónica backend).
  IF p_new_status = 'sent_to_client' THEN
    SELECT marketplace_ready INTO v_applicant_ready
    FROM app_14da0f1941_profiles
    WHERE user_id = v_app.user_id;

    IF v_applicant_ready IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'profile_not_marketplace_ready');
    END IF;
  END IF;

  UPDATE app_14da0f1941_job_applications
  SET status = p_new_status
  WHERE id = p_application_id;

  INSERT INTO app_14da0f1941_job_application_events
    (application_id, from_status, to_status, actor_user_id, actor_role, note)
  VALUES
    (p_application_id, v_app.status, p_new_status, v_actor, v_role, p_note);

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', p_new_status);
END;
$$;

COMMENT ON FUNCTION public.app_update_application_status(uuid, text, text) IS
  'PB-JOBS-ATS-001 + PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: transacción de estado; sent_to_client exige marketplace_ready; pending_profile_validation solo staff.';

REVOKE ALL ON FUNCTION public.app_update_application_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_update_application_status(uuid, text, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. Backfill: candidaturas 'applied' actuales de perfiles SIN marketplace_ready
-- ══════════════════════════════════════════════════════════════════════════════
-- Convierte el caso motivador (BASF, INEOS, …): la candidatura se conserva,
-- deja de ser presentable y pasa a pedir completar perfil. Solo estados NO
-- terminales ('applied'); sin emails retroactivos (no hay consentimiento de
-- contacto previo verificable para ese histórico).
-- Reversible: UPDATE ... SET status='applied' WHERE id IN (...events note...).

DO $$
DECLARE
  v_app record;
  v_moved integer := 0;
BEGIN
  FOR v_app IN
    SELECT a.id
    FROM public.app_14da0f1941_job_applications a
    JOIN public.app_14da0f1941_profiles p ON p.user_id = a.user_id
    WHERE a.status = 'applied'
      AND p.marketplace_ready IS NOT TRUE
    FOR UPDATE OF a
  LOOP
    UPDATE public.app_14da0f1941_job_applications
    SET status = 'pending_profile_validation'
    WHERE id = v_app.id;

    INSERT INTO public.app_14da0f1941_job_application_events
      (application_id, from_status, to_status, actor_user_id, actor_role, note)
    VALUES
      (v_app.id, 'applied', 'pending_profile_validation', NULL, 'system',
       'backfill PB-JOBS-MARKETPLACE-READY-ACTIVATION-001: profile not marketplace_ready');

    v_moved := v_moved + 1;
  END LOOP;

  RAISE NOTICE 'PB-JOBS-MARKETPLACE-READY-ACTIVATION-001 backfill: % candidaturas movidas a pending_profile_validation', v_moved;
END $$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado, ejecutar solo tras decisión explícita)
-- ══════════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- UPDATE app_14da0f1941_job_applications a
-- SET status = 'applied'
-- WHERE a.status = 'pending_profile_validation'
--   AND EXISTS (SELECT 1 FROM app_14da0f1941_job_application_events e
--               WHERE e.application_id = a.id
--                 AND e.note LIKE 'backfill PB-JOBS-MARKETPLACE-READY-ACTIVATION-001%');
-- DROP TRIGGER IF EXISTS app_14da0f1941_profiles_marketplace_ready_activation ON app_14da0f1941_profiles;
-- DROP TRIGGER IF EXISTS app_14da0f1941_job_applications_initial_status ON app_14da0f1941_job_applications;
-- DROP TRIGGER IF EXISTS app_14da0f1941_job_applications_log_initial ON app_14da0f1941_job_applications;
-- DROP FUNCTION IF EXISTS app_14da0f1941_on_marketplace_ready_transition();
-- DROP FUNCTION IF EXISTS app_14da0f1941_set_application_initial_status();
-- DROP FUNCTION IF EXISTS app_14da0f1941_log_application_initial_status();
-- DROP TABLE IF EXISTS app_14da0f1941_marketplace_ready_activations;
-- DROP TABLE IF EXISTS app_14da0f1941_job_application_profile_pending_emails;
-- DROP FUNCTION IF EXISTS app_14da0f1941_claim_application_profile_pending_email(uuid, integer, integer);
-- DROP FUNCTION IF EXISTS app_14da0f1941_marc_application_profile_pending_email_phase(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app_14da0f1941_finalize_application_profile_pending_email(uuid, uuid, text, text, text);
-- DROP FUNCTION IF EXISTS app_14da0f1941_claim_marketplace_ready_activation(uuid, integer, integer);
-- DROP FUNCTION IF EXISTS app_14da0f1941_marc_marketplace_ready_activation_phase(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app_14da0f1941_finalize_marketplace_ready_activation(uuid, uuid, text, text, text);
-- COMMIT;
