-- ══════════════════════════════════════════════════════════════════════════════
-- PB-I18N-EMAIL-001 (rev.9) — Corrección de sql/030d: ambigüedad 42702.
--
-- MOTIVO
--   `claim` en 030d declaró `RETURNS TABLE (…, state, attempts, reason,
--   claim_id, delivery_phase)`: esos parámetros de salida colisionan con las
--   columnas homónimas de la tabla en los `WHERE`/`UPDATE` sin calificar,
--   reproduciendo el 42702 que 030a ya corrigió en `finalize`:
--     ERROR 42702 — column reference "state" is ambiguous
--   Detectado por la matriz QA (tests/job-application-notification-claim.spec.ts).
--   `finalize` y `marc_delivery_phase` ya estaban calificadas y no necesitan
--   cambio.
--
-- FIX
--   Reemplazo íntegro de `claim` con TODAS las referencias a columnas
--   calificadas con el nombre completo de la tabla. Idempotente y sin efecto
--   sobre datos: misma firma, mismos GRANTs.
--
-- ORDEN: 030 → 030a → 030b → 030c → 030d → 030e. Reproducible en entorno
--   limpio y convergente con QA, donde 030d (con el defecto) ya consta en el
--   historial.
--
-- ROLLBACK: re-aplicar el cuerpo anterior de `claim` desde 030d
--   (no recomendado: reintroduce el 42702).
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer);

CREATE FUNCTION public.app_14da0f1941_claim_job_application_notification(
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
  v_row public.app_14da0f1941_job_application_notifications;
  v_now timestamptz := now();
BEGIN
  IF p_application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'missing_application_id', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- ── Paso A (transición segura): 'ambiguous' para reclamos caducados cuya
  -- fase es 'send_started' o desconocida (transmisión posible, no demostrada).
  UPDATE public.app_14da0f1941_job_application_notifications
    SET state = 'ambiguous',
        last_error = 'lease_expired_after_send_started_or_unknown_phase',
        updated_at = v_now
  WHERE application_id = p_application_id
    AND public.app_14da0f1941_job_application_notifications.state = 'claimed'
    AND lease_expires_at < v_now
    AND public.app_14da0f1941_job_application_notifications.delivery_phase IS DISTINCT FROM 'pre_send';

  -- ── Paso B: reclamo atómico. Solo caducados en 'pre_send' (no-transmisión
  -- demostrada) o 'failed' limpios.
  INSERT INTO public.app_14da0f1941_job_application_notifications
    (application_id, state, attempts, claimed_at, lease_expires_at, updated_at, claim_id, delivery_phase)
  VALUES
    (p_application_id, 'claimed', 1, v_now, v_now + make_interval(secs => p_lease_seconds), v_now, gen_random_uuid(), 'pre_send')
  ON CONFLICT (application_id) DO UPDATE
    SET state            = 'claimed',
        attempts         = public.app_14da0f1941_job_application_notifications.attempts + 1,
        claimed_at       = v_now,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        last_error       = NULL,
        updated_at       = v_now,
        claim_id         = gen_random_uuid(),
        delivery_phase   = 'pre_send'
    WHERE
      (
        public.app_14da0f1941_job_application_notifications.state = 'failed'
        OR (
          public.app_14da0f1941_job_application_notifications.state = 'claimed'
          AND public.app_14da0f1941_job_application_notifications.lease_expires_at < v_now
          AND public.app_14da0f1941_job_application_notifications.delivery_phase = 'pre_send'
        )
      )
      AND public.app_14da0f1941_job_application_notifications.attempts < p_max_attempts
  RETURNING * INTO v_row;

  IF v_row.application_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_row.state, v_row.attempts, 'claimed'::text, v_row.claim_id, v_row.delivery_phase;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.app_14da0f1941_job_application_notifications
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

COMMENT ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) IS
  'PB-I18N-EMAIL-001 (030e): reclamo atómico con fase de entrega; WHERE calificado, corrige 42702 de 030d.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) TO service_role;
