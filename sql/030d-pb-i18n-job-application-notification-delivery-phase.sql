-- ══════════════════════════════════════════════════════════════════════════════
-- PB-I18N-EMAIL-001 (rev.9) — Fase de entrega (pre_send / send_started) y
-- transición segura de reclamos caducados.
--
-- DEFECTO P1 (auditoría rev.8 sobre el fencing de 030c)
--   El fencing impide que un proceso caducado CIERRE el reclamo de otro, pero
--   el vencimiento del lease todavía RETOMA el reclamo como 'failed' sin
--   distinguir si el proceso anterior ya había contactado con SMTP. Si el
--   proceso 1 marcó "empiezo a enviar" y murió con el correo posiblemente
--   transmitido, el lease vencía y el proceso 2 lo reclamaba → **segundo
--   envío del mismo mensaje**.
--
-- DISEÑO — separación de fases (opción 3 de la auditoría)
--   Nueva columna `delivery_phase`:
--     · 'pre_send'      — reclamo tomado pero SMTP aún NO contactado. Si el
--                         lease vence aquí, la NO transmisión está demostrada
--                         → el reclamo puede retomarse con seguridad.
--     · 'send_started'  — el proceso persistió esta fase JUSTO ANTES de
--                         contactar con SMTP (marc_delivery_phase). Si el
--                         lease vence aquí, la transmisión es posible pero no
--                         demostrada → NO se retoma: pasa a 'ambiguous'
--                         terminal (resolución manual).
--   La marca de fase es el ÚNICO punto de no retorno: todo lo que ocurre
--   después (conectar, autenticar, transmitir, esperar confirmación) es
--   indistinguible de un envío real si el proceso muere a medias.
--
-- TRANSICIONES (claim)
--   · 'claimed' + lease vivo                     → in_progress_elsewhere
--   · 'claimed' + lease vencido + 'pre_send'     → retoma segura (failed)
--   · 'claimed' + lease vencido + 'send_started' → 'ambiguous' (NO retoma)
--   · 'claimed' + lease vencido + fase NULL      → 'ambiguous' (conservador:
--     la fase es desconocida, no se puede demostrar no-transmisión)
--   · 'failed' con intentos restantes            → retoma (ya cerrado limpio)
--   · 'sent' / 'ambiguous'                       → terminal
--
-- NUEVA RPC — marc_delivery_phase
--   Persiste 'send_started' SOLO si el caller posee el intento vigente
--   (mismo fencing por claim_id). Atómica: UPDATE … WHERE state='claimed'
--   AND claim_id=p_claim_id AND delivery_phase='pre_send'.
--
-- COMPATIBILIDAD
--   · No reescribe 030/030a/030b/030c. Orden: … → 030c → 030d.
--   · Columna con DEFAULT 'pre_send': las filas existentes quedan en fase
--     segura (reintentable). Un reclamo vivo de un proceso antiguo (sin
--     marcar) vencerá → 'ambiguous' en vez de retomar: es la opción
--     conservadora (no enviar duplicado).
--   · claim añade la fase al resultado: DROP previo (cambia RETURNS TABLE).
--
-- SEGURIDAD (sin cambios de modelo)
--   · RLS sin políticas; sin GRANTs a anon/authenticated/PUBLIC.
--   · RPCs SECURITY DEFINER, search_path fijado, EXECUTE solo service_role.
--
-- ROLLBACK:
--   ALTER TABLE … DROP COLUMN IF EXISTS delivery_phase;
--   -- y restaurar claim desde 030c (el DROP de marc_delivery_phase es aditivo).
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Fase de entrega. DEFAULT 'pre_send' cubre filas existentes (fase segura).
ALTER TABLE public.app_14da0f1941_job_application_notifications
  ADD COLUMN IF NOT EXISTS delivery_phase text NOT NULL DEFAULT 'pre_send';

ALTER TABLE public.app_14da0f1941_job_application_notifications
  DROP CONSTRAINT IF EXISTS job_application_notifications_delivery_phase_valid;

ALTER TABLE public.app_14da0f1941_job_application_notifications
  ADD CONSTRAINT job_application_notifications_delivery_phase_valid
    CHECK (delivery_phase IN ('pre_send', 'send_started'));

COMMENT ON COLUMN public.app_14da0f1941_job_application_notifications.delivery_phase IS
  'PB-I18N-EMAIL-001 (030d): pre_send = SMTP no contactado (reintentable); send_started = SMTP posiblemente contactado (vencimiento → ambiguous, NO reintento).';

-- 2. claim: transición segura según la fase del reclamo caducado.
-- (DROP previo: RETURNS TABLE añade delivery_phase.)
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

  -- ── Paso A (transición segura): convertir en 'ambiguous' los reclamos
  -- caducados cuya fase es 'send_started' o desconocida. La transmisión es
  -- posible pero no demostrada: NUNCA se retoman automáticamente. Se hace en
  -- la misma función para que la evaluación del paso B ya vea el estado
  -- terminal y no pueda reclamarlo.
  UPDATE public.app_14da0f1941_job_application_notifications
    SET state = 'ambiguous',
        last_error = 'lease_expired_after_send_started_or_unknown_phase',
        updated_at = v_now
  WHERE application_id = p_application_id
    AND state = 'claimed'
    AND lease_expires_at < v_now
    AND delivery_phase IS DISTINCT FROM 'pre_send'; -- 'send_started' o NULL

  -- ── Paso B: reclamo atómico. Solo se retoman los caducados cuya fase es
  -- 'pre_send' (no-transmisión demostrada) o los 'failed' limpios.
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
        -- Todo reclamo (nuevo o retomado) vuelve a pre_send: aún no se ha
        -- contactado SMTP en ESTE intento.
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
  'PB-I18N-EMAIL-001 (030d): reclamo atómico. Reclamos caducados en send_started/fase desconocida → ambiguous terminal (no se reintentan); solo pre_send o failed son reclamables.';

-- 3. marc_delivery_phase: el punto de no retorno antes de contactar SMTP.
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
  -- Solo se puede AVANZAR a send_started. No hay vuelta a pre_send (la fase es
  -- monótona: una vez contactado SMTP ya no se puede "des-contactar").
  IF p_phase <> 'send_started' THEN
    RAISE EXCEPTION 'invalid_phase_transition: %', p_phase;
  END IF;

  UPDATE public.app_14da0f1941_job_application_notifications
    SET delivery_phase = 'send_started',
        updated_at = now()
  WHERE application_id = p_application_id
    AND state = 'claimed'
    AND claim_id = p_claim_id
    AND delivery_phase = 'pre_send'
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
  'PB-I18N-EMAIL-001 (030d): persiste send_started (punto de no retorno) solo si el caller posee el intento vigente (fencing). Fase monótona.';

-- 4. Permisos (idéntico modelo).
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_claim_job_application_notification(uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_marc_job_application_notification_phase(uuid, uuid, text) TO service_role;
