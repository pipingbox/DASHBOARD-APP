-- ══════════════════════════════════════════════════════════════════════════════
-- PB-I18N-EMAIL-001 — Reclamo atómico de notificación de candidatura (anti-replay).
--
-- APLICABLE A: CLI local y QA (uqfbilyfpflrlthnyijj). Para PRODUCCIÓN requiere
--   GO independiente: el emisor desplegado (v13) no conoce esta tabla y seguirá
--   funcionando igual mientras no se despliegue la fuente mantenible.
--
-- PROBLEMA QUE RESUELVE
--   `app_14da0f1941_send_job_application_notification` v13 solo comprueba que la
--   candidatura tenga menos de 15 minutos (`REPLAY_WINDOW_MS`). No hay marca de
--   "ya notificado", así que N invocaciones dentro de esa ventana producen N
--   correos al buzón interno por una sola candidatura. La tabla
--   `app_14da0f1941_job_applications` no tiene ninguna columna de notificación,
--   de modo que el patrón de `app_14da0f1941_send_lead_notification`
--   (`update … is('notified_at', null)`) es imposible de aplicar ahí.
--   Evidencia: PB-I18N-EMAIL-001/EMISOR-JOBS-CONTRASTE-V13.md §2.3.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA
--   1. Un único `notified_at` no puede expresar los tres estados que importan:
--      enviado, fallido reintentable y **ambiguo** (el proveedor pudo haber
--      aceptado el mensaje pero se perdió la confirmación). Confundir ambiguo
--      con fallido es exactamente lo que genera correos duplicados.
--   2. No toca el ACL ni las políticas de `job_applications`, cuyos permisos
--      difieren entre QA y producción.
--   3. Deja traza auditable de intentos sin ensuciar la tabla de negocio.
--
-- GARANTÍAS
--   · Atomicidad: el reclamo es UNA sola sentencia (`INSERT … ON CONFLICT DO
--     UPDATE … WHERE`). La clave primaria serializa a los competidores.
--   · Concurrencia: dos invocaciones simultáneas sobre la misma candidatura →
--     una obtiene el reclamo, la otra recibe `claimed=false`. No hay ventana.
--   · Duplicados: un envío confirmado (`state='sent'`) nunca vuelve a
--     reclamarse, haya pasado el tiempo que sea.
--   · Reintentos: solo desde `state='failed'`, con el lease vencido y por
--     debajo del máximo de intentos.
--   · Resultado ambiguo: `state='ambiguous'` es terminal y **no se reintenta
--     nunca de forma automática**. Preferimos un aviso perdido y visible a un
--     duplicado silencioso. Se resuelve a mano desde el registro.
--   · Recuperación tras caída: si el proceso muere con el reclamo tomado, el
--     lease vence y el siguiente intento legítimo puede retomarlo.
--
-- SEGURIDAD
--   · RLS activada **sin ninguna política**: `anon` y `authenticated` no pueden
--     leer ni escribir nada. Solo `service_role` (que no pasa por RLS).
--   · Sin GRANT a `anon` ni a `authenticated`.
--   · Las funciones son SECURITY DEFINER con `search_path` fijado y EXECUTE
--     revocado a `public`, `anon` y `authenticated`.
--   · No almacena datos personales: solo el id de la candidatura, estados,
--     contadores y el `message_id` del proveedor.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text);
--   DROP FUNCTION IF EXISTS public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer);
--   DROP TABLE IF EXISTS public.app_14da0f1941_job_application_notifications;
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_job_application_notifications (
  application_id   uuid PRIMARY KEY
                     REFERENCES public.app_14da0f1941_job_applications(id) ON DELETE CASCADE,
  state            text        NOT NULL,
  attempts         integer     NOT NULL DEFAULT 1,
  claimed_at       timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  sent_at          timestamptz NULL,
  message_id       text        NULL,
  last_error       text        NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_14da0f1941_job_application_notifications
  DROP CONSTRAINT IF EXISTS job_application_notifications_state_valid;

ALTER TABLE public.app_14da0f1941_job_application_notifications
  ADD CONSTRAINT job_application_notifications_state_valid
  CHECK (state IN ('claimed', 'sent', 'ambiguous', 'failed'));

ALTER TABLE public.app_14da0f1941_job_application_notifications
  DROP CONSTRAINT IF EXISTS job_application_notifications_attempts_positive;

ALTER TABLE public.app_14da0f1941_job_application_notifications
  ADD CONSTRAINT job_application_notifications_attempts_positive
  CHECK (attempts >= 1);

COMMENT ON TABLE public.app_14da0f1941_job_application_notifications IS
  'PB-I18N-EMAIL-001: reclamo atómico del aviso administrativo de candidatura. Un registro por candidatura. Sin datos personales.';

ALTER TABLE public.app_14da0f1941_job_application_notifications ENABLE ROW LEVEL SECURITY;

-- Sin políticas: nadie salvo service_role (que no pasa por RLS) accede.
REVOKE ALL ON public.app_14da0f1941_job_application_notifications FROM PUBLIC;
REVOKE ALL ON public.app_14da0f1941_job_application_notifications FROM anon;
REVOKE ALL ON public.app_14da0f1941_job_application_notifications FROM authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- Reclamo atómico.
--
-- Devuelve (claimed, state, attempts, reason):
--   claimed=true  → esta invocación tiene el derecho exclusivo de enviar.
--   claimed=false → ya enviado ('sent'), ambiguo ('ambiguous'), en curso por
--                   otro con lease vivo ('claimed'), o agotados los intentos.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_14da0f1941_claim_job_application_notification(
  p_application_id uuid,
  p_max_attempts   integer DEFAULT 3,
  p_lease_seconds  integer DEFAULT 120
)
RETURNS TABLE (claimed boolean, state text, attempts integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_job_application_notifications;
BEGIN
  IF p_application_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'missing_application_id';
    RETURN;
  END IF;

  -- Una sola sentencia: quien inserta gana; si ya existe, solo se reclama
  -- cuando el WHERE del DO UPDATE se cumple. Si no se cumple, no hay fila
  -- devuelta y el reclamo se deniega sin condición de carrera.
  INSERT INTO public.app_14da0f1941_job_application_notifications
    (application_id, state, attempts, claimed_at, lease_expires_at, updated_at)
  VALUES
    (p_application_id, 'claimed', 1, now(), now() + make_interval(secs => p_lease_seconds), now())
  ON CONFLICT (application_id) DO UPDATE
    SET state            = 'claimed',
        attempts         = public.app_14da0f1941_job_application_notifications.attempts + 1,
        claimed_at       = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        last_error       = NULL,
        updated_at       = now()
    WHERE
      -- Reintento de un fallo confirmado, con el lease vencido y sin agotar
      -- intentos. 'sent' y 'ambiguous' quedan fuera a propósito; 'claimed' con
      -- lease vivo también (otro proceso lo tiene).
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
    RETURN QUERY SELECT true, v_row.state, v_row.attempts, 'claimed'::text;
    RETURN;
  END IF;

  -- No se reclamó: explicar por qué, para que el emisor pueda registrarlo.
  SELECT * INTO v_row
  FROM public.app_14da0f1941_job_application_notifications
  WHERE application_id = p_application_id;

  IF v_row.application_id IS NULL THEN
    -- La inserción falló por la clave ajena: la candidatura no existe.
    RETURN QUERY SELECT false, NULL::text, 0, 'unknown_application';
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
    END::text;

EXCEPTION
  -- La candidatura no existe: la clave ajena lo detecta. Se responde sin
  -- reclamo en lugar de propagar la excepción, para que el emisor pueda
  -- registrar el motivo y devolver 200 sin enviar nada.
  WHEN foreign_key_violation THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'unknown_application'::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) IS
  'PB-I18N-EMAIL-001: reclamo atómico del aviso de candidatura. Un solo INSERT … ON CONFLICT DO UPDATE … WHERE; sin ventana de carrera.';

-- ──────────────────────────────────────────────────────────────────────────────
-- Cierre del reclamo. p_state ∈ ('sent','ambiguous','failed').
--
-- Solo cierra un reclamo propio ('claimed'): no puede degradar un 'sent' ya
-- confirmado, ni reescribir un 'ambiguous'.
-- ──────────────────────────────────────────────────────────────────────────────
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
    AND state = 'claimed'
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
  'PB-I18N-EMAIL-001: cierra un reclamo propio como sent | ambiguous | failed. ambiguous es terminal y no se reintenta.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM authenticated;

REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_finalize_job_application_notification(uuid, text, text, text) TO service_role;
