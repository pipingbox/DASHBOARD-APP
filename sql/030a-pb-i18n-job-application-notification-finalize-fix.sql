-- ══════════════════════════════════════════════════════════════════════════════
-- PB-I18N-EMAIL-001 — Corrección de sql/030: ambigüedad 42702 en finalize.
--
-- MOTIVO
--   `app_14da0f1941_finalize_job_application_notification` declara
--   `RETURNS TABLE (finalized, state, attempts)`: los parámetros de salida
--   `state` y `attempts` colisionan con las columnas homónimas de la tabla.
--   En el `UPDATE … WHERE … AND state = 'claimed'`, PostgreSQL no puede
--   decidir si `state` es la columna o la variable y responde:
--     42702 — column reference "state" is ambiguous
--   Detectado por la matriz QA de la rev.7 (tests/job-application-notification-claim.spec.ts).
--   La función `claim` no necesita corrección: todas sus referencias a
--   columnas ya van calificadas con el nombre completo de la tabla.
--
-- FIX
--   Reemplazo íntegro de la función con la referencia del WHERE calificada.
--   Idempotente y sin efecto sobre datos: misma firma, mismos GRANTs.
--
-- ORDEN: 030 → 030a. Reproducible en entorno limpio y convergente con QA,
--   donde 030 (con el defecto) ya consta en el historial de migraciones.
--
-- ROLLBACK: re-aplicar el cuerpo anterior de la función desde sql/030
--   (no recomendado: reintroduce el 42702).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_14da0f1941_finalize_job_application_notification(
  p_application_id uuid,
  p_state          text,
  p_message_id     text DEFAULT NULL,
  p_last_error     text DEFAULT NULL
)
RETURNS TABLE (finalized boolean, state text, attempts integer)
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

  UPDATE public.app_14da0f1941_job_application_notifications
    SET state      = p_state,
        sent_at    = CASE WHEN p_state = 'sent' THEN now() ELSE sent_at END,
        message_id = COALESCE(p_message_id, message_id),
        -- Truncado: el mensaje de error del proveedor no debe crecer sin
        -- límite ni arrastrar contenido del mensaje.
        last_error = CASE WHEN p_last_error IS NULL THEN last_error ELSE left(p_last_error, 500) END,
        -- El lease deja de tener sentido una vez cerrado.
        lease_expires_at = now(),
        updated_at = now()
  WHERE application_id = p_application_id
    AND public.app_14da0f1941_job_application_notifications.state = 'claimed'
  RETURNING * INTO v_row;

  IF v_row.application_id IS NULL THEN
    SELECT * INTO v_row
    FROM public.app_14da0f1941_job_application_notifications
    WHERE application_id = p_application_id;
    RETURN QUERY SELECT false, v_row.state, COALESCE(v_row.attempts, 0);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.state, v_row.attempts;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text) IS
  'PB-I18N-EMAIL-001: cierra un reclamo propio como sent | ambiguous | failed. ambiguous es terminal y no se reintenta. (030a: WHERE calificado, corrige 42702.)';

REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text) TO service_role;
