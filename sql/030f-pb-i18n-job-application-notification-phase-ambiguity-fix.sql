-- ══════════════════════════════════════════════════════════════════════════════
-- PB-I18N-EMAIL-001 (rev.9) — Corrección de sql/030d: ambigüedad 42702 en
-- `marc_delivery_phase`.
--
-- MOTIVO
--   Igual que `claim` (030e): `marc_delivery_phase` declaró
--   `RETURNS TABLE (marked, delivery_phase, reason)` y los parámetros de salida
--   `delivery_phase` colisionan con la columna en el `WHERE` del UPDATE sin
--   calificar → ERROR 42702. Detectado por la matriz QA (la marca devolvía
--   error y la suite de fase fallaba).
--
-- FIX
--   Reemplazo íntegro con TODAS las referencias a columnas calificadas.
--   Idempotente y sin efecto sobre datos: misma firma, mismos GRANTs.
--
-- ORDEN: … → 030d → 030e → 030f. Reproducible en entorno limpio y convergente
--   con QA, donde 030d (con el defecto) ya consta en el historial.
--
-- ROLLBACK: re-aplicar el cuerpo anterior desde 030d (reintroduce 42702).
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text);

CREATE FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(
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
  v_row public.app_14da0f1941_job_application_notifications;
BEGIN
  -- La fase es monótona: solo se puede AVANZAR a send_started.
  IF p_phase <> 'send_started' THEN
    RAISE EXCEPTION 'invalid_phase_transition: %', p_phase;
  END IF;

  UPDATE public.app_14da0f1941_job_application_notifications
    SET delivery_phase = 'send_started',
        updated_at = now()
  WHERE application_id = p_application_id
    AND public.app_14da0f1941_job_application_notifications.state = 'claimed'
    AND public.app_14da0f1941_job_application_notifications.claim_id = p_claim_id
    AND public.app_14da0f1941_job_application_notifications.delivery_phase = 'pre_send'
  RETURNING * INTO v_row;

  IF v_row.application_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_row.delivery_phase, 'marked'::text;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.app_14da0f1941_job_application_notifications
  WHERE application_id = p_application_id;

  IF v_row.application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'unknown_application'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    false,
    v_row.delivery_phase,
    CASE
      WHEN v_row.state <> 'claimed' THEN 'not_claimed'
      WHEN v_row.claim_id IS DISTINCT FROM p_claim_id THEN 'fenced_out'
      ELSE 'already_marked'
    END::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text) IS
  'PB-I18N-EMAIL-001 (030f): persiste send_started (punto de no retorno) solo con el token vigente; WHERE calificado, corrige 42702 de 030d.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text) TO service_role;
