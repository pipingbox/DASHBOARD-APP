-- ══════════════════════════════════════════════════════════════════════════════
-- PB-I18N-EMAIL-001 (rev.8) — Fencing token para el protocolo claim/finalize.
--
-- DEFECTO P1 CONFIRMADO POR AUDITORÍA
--   Cuando caduca un lease y un segundo proceso reclama el envío, el primero
--   todavía puede cerrar el NUEVO reclamo: `finalize` solo comprobaba
--   `state='claimed'`, sin verificar quién posee el intento vigente. Un
--   `finalize` tardío del proceso 1 podía marcar `sent`/`failed`/`ambiguous`
--   un envío que el proceso 2 estaba realizando (falsa confirmación, doble
--   marca de failed reintentable, o ambiguous injustificado).
--
-- FIX — FENCING TOKEN (`claim_id`)
--   · Nueva columna `claim_id uuid`: cada reclamo (INSERT o retoma tras lease
--     vencido) genera un token nuevo con `gen_random_uuid()`.
--   · `claim` devuelve `claim_id` SOLO a quien gana el reclamo (NULL en caso
--     contrario): quien no posee el intento nunca ve el token.
--   · `finalize` exige `p_claim_id` y solo cierra si coincide con el reclamo
--     vigente (`state='claimed' AND claim_id = p_claim_id`). Un finalize
--     tardío con token caducado devuelve `finalized=false, reason='fenced_out'`
--     y NO toca la fila.
--   · La firma antigua de `finalize` se ELIMINA: no hay vía sin fencing.
--
-- COMPATIBILIDAD
--   · No modifica retrospectivamente 030/030a/030b (registradas en QA).
--   · Orden reproducible en entorno limpio: 030 → 030a → 030b → 030c.
--   · Tabla vacía o con filas existentes: el DEFAULT rellena `claim_id` en
--     filas previas (tokens huérfanos que nadie puede finalizar: quedarán
--     inutilizables al vencer su lease, que es el comportamiento seguro).
--   · El emisor v13 de producción no usa esta tabla: sin impacto.
--
-- SEGURIDAD (sin cambios de modelo)
--   · RLS sigue activa sin políticas; sin GRANTs a anon/authenticated/PUBLIC.
--   · RPCs SECURITY DEFINER con search_path fijado; EXECUTE solo service_role.
--   · `claim_id` es un uuid opaco: no expone datos personales ni sirve para
--     nada fuera de esta tabla.
--
-- ROLLBACK:
--   ALTER TABLE public.app_14da0f1941_job_application_notifications DROP COLUMN IF EXISTS claim_id;
--   -- y restaurar las firmas anteriores de las RPCs desde 030/030a.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Columna del fencing token.
ALTER TABLE public.app_14da0f1941_job_application_notifications
  ADD COLUMN IF NOT EXISTS claim_id uuid NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.app_14da0f1941_job_application_notifications.claim_id IS
  'PB-I18N-EMAIL-001 (030c): fencing token del intento vigente. Solo finalize con este token puede cerrar el reclamo.';

-- 2. claim: genera y devuelve el token al ganador.
-- (DROP previo obligatorio: el tipo de retorno cambia al añadir claim_id.)
DROP FUNCTION IF EXISTS public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.app_14da0f1941_claim_job_application_notification(
  p_application_id uuid,
  p_max_attempts   integer DEFAULT 3,
  p_lease_seconds  integer DEFAULT 120
)
RETURNS TABLE (claimed boolean, state text, attempts integer, reason text, claim_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_job_application_notifications;
BEGIN
  IF p_application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'missing_application_id', NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.app_14da0f1941_job_application_notifications
    (application_id, state, attempts, claimed_at, lease_expires_at, updated_at, claim_id)
  VALUES
    (p_application_id, 'claimed', 1, now(), now() + make_interval(secs => p_lease_seconds), now(), gen_random_uuid())
  ON CONFLICT (application_id) DO UPDATE
    SET state            = 'claimed',
        attempts         = public.app_14da0f1941_job_application_notifications.attempts + 1,
        claimed_at       = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        last_error       = NULL,
        updated_at       = now(),
        -- Token NUEVO en cada reclamo: invalida el token del proceso anterior
        -- (fencing). Es lo que impide que un finalize tardío cierre este intento.
        claim_id         = gen_random_uuid()
    WHERE
      (
        public.app_14da0f1941_job_application_notifications.state = 'failed'
        OR (
          public.app_14da0f1941_job_application_notifications.state = 'claimed'
          AND public.app_14da0f1941_job_application_notifications.lease_expires_at < now()
        )
      )
      AND public.app_14da0f1941_job_application_notifications.attempts < p_max_attempts
  RETURNING * INTO v_row;

  IF v_row.application_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_row.state, v_row.attempts, 'claimed'::text, v_row.claim_id;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.app_14da0f1941_job_application_notifications
  WHERE application_id = p_application_id;

  IF v_row.application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'unknown_application', NULL::uuid;
    RETURN;
  END IF;

  -- Sin reclamo no hay token: quien no posee el intento no recibe el suyo.
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
    NULL::uuid;

EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'unknown_application'::text, NULL::uuid;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) IS
  'PB-I18N-EMAIL-001 (030c): reclamo atómico con fencing token. claim_id solo se devuelve al ganador; cada retoma genera token nuevo.';

-- 3. finalize: firma nueva con p_claim_id obligatorio. Se ELIMINA la antigua.
DROP FUNCTION IF EXISTS public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text);

CREATE FUNCTION public.app_14da0f1941_finalize_job_application_notification(
  p_application_id uuid,
  p_claim_id       uuid,
  p_state          text,
  p_message_id     text DEFAULT NULL,
  p_last_error     text DEFAULT NULL
)
RETURNS TABLE (finalized boolean, state text, attempts integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_job_application_notifications;
BEGIN
  IF p_state NOT IN ('sent', 'ambiguous', 'failed') THEN
    RAISE EXCEPTION 'invalid_finalize_state: %', p_state;
  END IF;

  -- p_claim_id NULL jamás coincide: no hay cierre sin fencing.
  UPDATE public.app_14da0f1941_job_application_notifications
    SET state      = p_state,
        sent_at    = CASE WHEN p_state = 'sent' THEN now() ELSE sent_at END,
        message_id = COALESCE(p_message_id, message_id),
        last_error = CASE WHEN p_last_error IS NULL THEN last_error ELSE left(p_last_error, 500) END,
        lease_expires_at = now(),
        updated_at = now()
  WHERE application_id = p_application_id
    AND public.app_14da0f1941_job_application_notifications.state = 'claimed'
    AND public.app_14da0f1941_job_application_notifications.claim_id = p_claim_id
  RETURNING * INTO v_row;

  IF v_row.application_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_row.state, v_row.attempts, 'finalized'::text;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.app_14da0f1941_job_application_notifications
  WHERE application_id = p_application_id;

  IF v_row.application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'unknown_application'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    false,
    v_row.state,
    v_row.attempts,
    CASE
      WHEN v_row.state = 'claimed' THEN 'fenced_out'
      ELSE 'not_claimed'
    END::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, uuid, text, text, text) IS
  'PB-I18N-EMAIL-001 (030c): cierra SOLO el reclamo vigente (fencing por claim_id). Un finalize tardío con token caducado devuelve fenced_out sin tocar la fila.';

-- 4. Permisos: idéntico modelo (EXECUTE solo service_role).
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, uuid, text, text, text) TO service_role;
