-- ══════════════════════════════════════════════════════════════════════════════
-- PB-WELCOME-EMAIL-001 — Correo automático de bienvenida PIPINGBOX
--
-- Envía UN único correo de bienvenida por usuario cuando éste ha confirmado
-- REALMENTE su dirección de email (auth.users.email_confirmed_at pasa de NULL
-- a no NULL, o nace ya confirmado en un alta OAuth/Google).
--
-- GARANTÍAS DE DISEÑO
--
--   1. EXACTAMENTE UNO POR USUARIO — estructural, no por convención: la tabla
--      de outbox tiene PRIMARY KEY (user_id). Dos encolados concurrentes del
--      mismo usuario no pueden crear dos filas; el segundo choca con la PK.
--
--   2. CONFIRMACIÓN REAL OBLIGATORIA — se encola leyendo email_confirmed_at de
--      auth.users desde funciones SECURITY DEFINER. El cliente nunca aporta el
--      dato de confirmación, así que no puede falsificarlo.
--
--   3. NO DISPARA POR LOGIN NI POR RECUPERACIÓN DE CONTRASEÑA — el trigger es
--      AFTER UPDATE **OF email_confirmed_at** y además exige la transición
--      NULL -> NOT NULL. Un login toca last_sign_in_at; un reset de contraseña
--      toca encrypted_password/recovery_token: ninguno entra por aquí. Una
--      reconfirmación o un cambio de email tampoco, porque OLD ya no es NULL.
--
--   4. CERO RETROACTIVIDAD — doble cerrojo. El encolado exige
--      `enabled = true` Y `email_confirmed_at >= enabled_at`. Mientras la
--      feature está OFF no se crea NINGUNA fila, así que al activarla no hay
--      backlog que vaciar de golpe; y los usuarios ya confirmados antes del
--      momento de activación quedan fuera por el suelo temporal (floor).
--      No existe ninguna función de backfill: es una omisión deliberada.
--
--   5. NUNCA BLOQUEA LA AUTENTICACIÓN — el cuerpo del trigger está envuelto en
--      EXCEPTION WHEN OTHERS. Si algo falla al encolar, se registra un evento
--      de telemetría y la confirmación del usuario continúa con normalidad.
--      Un fallo del correo de bienvenida no puede impedir que alguien entre.
--
--   6. AISLAMIENTO TOTAL RESPECTO A MARKETPLACE READY — tablas, estados, RPCs
--      y colas propias. No se lee ni se escribe nada de
--      app_14da0f1941_marketplace_ready_activations ni de
--      app_14da0f1941_job_application_profile_pending_emails (EMAIL 1/EMAIL 2),
--      ni se reutilizan las colas de recovery de
--      PB-JOBS-MARKETPLACE-READY-RECOVERY-001.
--
--   7. TELEMETRÍA SIN PII — la tabla de eventos NO guarda user_id, ni email, ni
--      nombre: sólo evento, tipo de cuenta, idioma, origen y un código de error
--      normalizado. Los identificadores viven únicamente en el outbox
--      operativo, que no es legible por anon ni authenticated.
--
-- Patrón de claim/lease/fase: idéntico a sql/030e/030f/034 (pre_send vs
-- send_started) para que un lease caducado tras iniciar la transmisión acabe en
-- 'ambiguous' y NUNCA en un segundo envío.
--
-- Idempotente: la migración se puede reaplicar sin efectos secundarios.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Configuración (singleton): interruptor y suelo anti-retroactividad
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_welcome_email_config (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled    boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  note       text
);

COMMENT ON TABLE public.app_14da0f1941_welcome_email_config IS
  'PB-WELCOME-EMAIL-001: configuración singleton del correo de bienvenida. enabled=false por defecto (gate de producción del PO). enabled_at es el SUELO anti-retroactividad: sólo se encolan confirmaciones con email_confirmed_at >= enabled_at.';
COMMENT ON COLUMN public.app_14da0f1941_welcome_email_config.enabled_at IS
  'Momento de la última activación. Actúa como suelo temporal: ninguna confirmación anterior genera correo de bienvenida.';

INSERT INTO public.app_14da0f1941_welcome_email_config (id, enabled, enabled_at, note)
VALUES (true, false, NULL, 'PB-WELCOME-EMAIL-001: desactivado en la instalación; requiere GO del PO.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_14da0f1941_welcome_email_config ENABLE ROW LEVEL SECURITY;
-- Sin políticas: ni anon ni authenticated. Sólo service_role y las RPCs
-- SECURITY DEFINER de esta migración.
REVOKE ALL ON TABLE public.app_14da0f1941_welcome_email_config FROM PUBLIC;
REVOKE ALL ON TABLE public.app_14da0f1941_welcome_email_config FROM anon;
REVOKE ALL ON TABLE public.app_14da0f1941_welcome_email_config FROM authenticated;
GRANT SELECT ON TABLE public.app_14da0f1941_welcome_email_config TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Outbox + claim: PK = user_id  →  un único correo por usuario
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_welcome_emails (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type     text NOT NULL DEFAULT 'worker'
                     CHECK (account_type IN ('worker','company')),
  lang             text,
  confirmed_at     timestamptz NOT NULL,
  source           text NOT NULL DEFAULT 'auth_trigger'
                     CHECK (source IN ('auth_trigger','gate_rpc','sweep')),
  state            text NOT NULL DEFAULT 'pending'
                     CHECK (state IN ('pending','claimed','sent','ambiguous','failed','skipped')),
  attempts         integer NOT NULL DEFAULT 0,
  claim_id         uuid,
  delivery_phase   text CHECK (delivery_phase IN ('pre_send','send_started')),
  claimed_at       timestamptz,
  lease_expires_at timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,
  message_id       text,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_14da0f1941_welcome_emails IS
  'PB-WELCOME-EMAIL-001: outbox y claim de idempotencia del correo de bienvenida. PK = user_id: un usuario NO puede recibir dos correos de bienvenida. account_type y lang se capturan al encolar y se reconfirman en tiempo de envío.';
COMMENT ON COLUMN public.app_14da0f1941_welcome_emails.delivery_phase IS
  'pre_send = aún no se ha tocado el proveedor (reclamable tras caducar el lease). send_started = transmisión iniciada; un lease caducado aquí va a ambiguous, nunca a reenvío.';

CREATE INDEX IF NOT EXISTS welcome_emails_state_created_idx
  ON public.app_14da0f1941_welcome_emails (state, created_at);

ALTER TABLE public.app_14da0f1941_welcome_emails ENABLE ROW LEVEL SECURITY;
-- Sin políticas: ni anon ni authenticated leen/escriben (contiene user_id).
REVOKE ALL ON TABLE public.app_14da0f1941_welcome_emails FROM PUBLIC;
REVOKE ALL ON TABLE public.app_14da0f1941_welcome_emails FROM anon;
REVOKE ALL ON TABLE public.app_14da0f1941_welcome_emails FROM authenticated;
GRANT SELECT ON TABLE public.app_14da0f1941_welcome_emails TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Telemetría SIN PII
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_welcome_email_events (
  id           bigserial PRIMARY KEY,
  event        text NOT NULL,
  account_type text,
  lang         text,
  source       text,
  detail       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_14da0f1941_welcome_email_events IS
  'PB-WELCOME-EMAIL-001: telemetría agregada del correo de bienvenida. SIN PII por diseño: no contiene user_id, email ni nombre. detail sólo admite códigos de error normalizados, nunca texto libre del proveedor.';

CREATE INDEX IF NOT EXISTS welcome_email_events_event_created_idx
  ON public.app_14da0f1941_welcome_email_events (event, created_at DESC);

ALTER TABLE public.app_14da0f1941_welcome_email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_14da0f1941_welcome_email_events FROM PUBLIC;
REVOKE ALL ON TABLE public.app_14da0f1941_welcome_email_events FROM anon;
REVOKE ALL ON TABLE public.app_14da0f1941_welcome_email_events FROM authenticated;
GRANT SELECT ON TABLE public.app_14da0f1941_welcome_email_events TO service_role;

CREATE OR REPLACE FUNCTION public.app_14da0f1941_log_welcome_email_event(
  p_event        text,
  p_account_type text DEFAULT NULL,
  p_lang         text DEFAULT NULL,
  p_source       text DEFAULT NULL,
  p_detail       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- `detail` se recorta a 120 caracteres: es un código de diagnóstico, no un
  -- volcado del proveedor, y así se evita filtrar texto con PII por accidente.
  INSERT INTO public.app_14da0f1941_welcome_email_events
    (event, account_type, lang, source, detail)
  VALUES
    (left(p_event, 64), left(p_account_type, 16), left(p_lang, 8),
     left(p_source, 24), left(p_detail, 120));
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_log_welcome_email_event(text, text, text, text, text) IS
  'PB-WELCOME-EMAIL-001: registra un evento agregado sin PII del correo de bienvenida.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Encolado canónico (lo usan el trigger de auth, el gate y el sweep)
-- ══════════════════════════════════════════════════════════════════════════════

-- Normaliza el tipo de cuenta declarado en el alta. Cualquier valor que no sea
-- 'company' se trata como 'worker': el tipo de cuenta se RECONFIRMA en tiempo
-- de envío contra el perfil canónico, de modo que un metadato manipulado no
-- decide la variante definitiva del correo.
CREATE OR REPLACE FUNCTION public.app_14da0f1941_welcome_normalize_account_type(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN lower(coalesce(p_value, '')) = 'company' THEN 'company' ELSE 'worker' END;
$$;

CREATE OR REPLACE FUNCTION public.app_14da0f1941_enqueue_welcome_email(
  p_user_id text,
  p_source  text DEFAULT 'auth_trigger'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      uuid;
  v_confirmed_at timestamptz;
  v_meta         jsonb;
  v_account_type text;
  v_lang         text;
  v_enabled      boolean;
  v_enabled_at   timestamptz;
  v_inserted     uuid;
BEGIN
  BEGIN
    v_user_id := p_user_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN 'invalid_user_id';
  END;

  IF v_user_id IS NULL THEN
    RETURN 'invalid_user_id';
  END IF;

  -- Cerrojo 1: la feature debe estar ACTIVA. Con la feature OFF no se crea
  -- ninguna fila, por lo que activarla nunca vacía un backlog acumulado.
  SELECT enabled, enabled_at
    INTO v_enabled, v_enabled_at
  FROM public.app_14da0f1941_welcome_email_config
  WHERE id = true;

  IF v_enabled IS NOT TRUE THEN
    RETURN 'feature_disabled';
  END IF;

  -- Confirmación REAL: se lee de auth.users, nunca del cliente.
  SELECT u.email_confirmed_at, coalesce(u.raw_user_meta_data, '{}'::jsonb)
    INTO v_confirmed_at, v_meta
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF NOT FOUND THEN
    RETURN 'unknown_user';
  END IF;

  IF v_confirmed_at IS NULL THEN
    RETURN 'not_confirmed';
  END IF;

  -- Cerrojo 2: suelo anti-retroactividad. Ninguna confirmación anterior al
  -- momento de activación genera correo de bienvenida.
  IF v_enabled_at IS NULL OR v_confirmed_at < v_enabled_at THEN
    RETURN 'before_floor';
  END IF;

  v_account_type := public.app_14da0f1941_welcome_normalize_account_type(
    v_meta ->> 'account_type'
  );
  v_lang := nullif(trim(v_meta ->> 'lang'), '');

  -- PK = user_id: el segundo encolado concurrente del mismo usuario choca aquí
  -- y se resuelve como 'duplicate' sin crear una segunda fila.
  INSERT INTO public.app_14da0f1941_welcome_emails
    (user_id, account_type, lang, confirmed_at, source, state, attempts, lease_expires_at)
  VALUES
    (v_user_id, v_account_type, v_lang, v_confirmed_at,
     CASE WHEN p_source IN ('auth_trigger','gate_rpc','sweep') THEN p_source ELSE 'auth_trigger' END,
     'pending', 0, now())
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN 'duplicate';
  END IF;

  PERFORM public.app_14da0f1941_log_welcome_email_event(
    'enqueued', v_account_type, v_lang, p_source, NULL
  );
  RETURN 'enqueued';
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_enqueue_welcome_email(text, text) IS
  'PB-WELCOME-EMAIL-001: encolado canónico del correo de bienvenida. Verifica feature flag, confirmación real en auth.users y suelo anti-retroactividad. Devuelve enqueued|duplicate|feature_disabled|before_floor|not_confirmed|unknown_user|invalid_user_id.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_enqueue_welcome_email(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_enqueue_welcome_email(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_enqueue_welcome_email(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_enqueue_welcome_email(text, text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Trigger sobre auth.users: confirmación real, nunca login ni recovery
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_14da0f1941_on_auth_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fire boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Alta que nace ya confirmada: OAuth/Google, o creación administrativa con
    -- email_confirm. Es un usuario nuevo y real, así que sí corresponde.
    v_fire := NEW.email_confirmed_at IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    -- SÓLO la transición NULL -> NOT NULL. Esto excluye por construcción el
    -- login habitual, la recuperación de contraseña, la reconfirmación y el
    -- cambio de dirección (en todos ellos OLD.email_confirmed_at ya no es NULL).
    v_fire := OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL;
  END IF;

  IF v_fire THEN
    PERFORM public.app_14da0f1941_enqueue_welcome_email(NEW.id::text, 'auth_trigger');
  END IF;

  RETURN NULL;

EXCEPTION
  -- Blindaje: el correo de bienvenida NUNCA puede romper la autenticación. Si
  -- el encolado falla se deja rastro agregado y la confirmación sigue su curso;
  -- el sweep de la sección 8 recupera la fila más tarde.
  WHEN others THEN
    BEGIN
      PERFORM public.app_14da0f1941_log_welcome_email_event(
        'enqueue_error', NULL, NULL, 'auth_trigger', left(SQLSTATE, 16)
      );
    EXCEPTION WHEN others THEN
      NULL;
    END;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_on_auth_email_confirmed() IS
  'PB-WELCOME-EMAIL-001: encola el correo de bienvenida en la confirmación REAL del email (INSERT ya confirmado o UPDATE NULL->NOT NULL). No dispara por login ni por recuperación de contraseña. Nunca propaga excepciones a auth.';

DROP TRIGGER IF EXISTS app_14da0f1941_auth_users_welcome_email ON auth.users;
CREATE TRIGGER app_14da0f1941_auth_users_welcome_email
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.app_14da0f1941_on_auth_email_confirmed();

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Gate self-healing: el usuario autenticado pide SU propio encolado
--
-- Red de seguridad para el caso en que el trigger no haya podido encolar (p. ej.
-- error transitorio). No recibe ningún parámetro: trabaja siempre sobre
-- auth.uid() y delega en el encolado canónico, que vuelve a comprobar la
-- confirmación real, el flag y el suelo. Un cliente no puede encolar a otro
-- usuario ni forzar un correo sin confirmar.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_14da0f1941_request_welcome_email()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;
  RETURN public.app_14da0f1941_enqueue_welcome_email(v_uid::text, 'gate_rpc');
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_request_welcome_email() IS
  'PB-WELCOME-EMAIL-001: self-healing idempotente del gate. Encola el correo de bienvenida del PROPIO usuario autenticado (auth.uid()); no admite parámetros, por lo que no permite actuar sobre terceros.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_request_welcome_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_request_welcome_email() FROM anon;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_request_welcome_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_request_welcome_email() TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Claim / fase / finalize (patrón sql/030e/030f/034)
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.app_14da0f1941_claim_welcome_email(uuid, integer, integer);
CREATE FUNCTION public.app_14da0f1941_claim_welcome_email(
  p_user_id       uuid,
  p_max_attempts  integer DEFAULT 3,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  claimed        boolean,
  state          text,
  attempts       integer,
  reason         text,
  claim_id       uuid,
  delivery_phase text,
  account_type   text,
  lang           text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_welcome_emails;
  v_now timestamptz := now();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'missing_user_id', NULL::uuid, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Paso A: un lease caducado cuya fase es 'send_started' (o desconocida) pasa
  -- a 'ambiguous'. La transmisión pudo ocurrir sin que llegáramos a
  -- confirmarla, así que se prohíbe el reintento y se marca para revisión
  -- manual. Es la regla que impide el correo duplicado ante un timeout.
  UPDATE public.app_14da0f1941_welcome_emails
    SET state      = 'ambiguous',
        last_error = 'lease_expired_after_send_started_or_unknown_phase',
        updated_at = v_now
  WHERE user_id = p_user_id
    AND public.app_14da0f1941_welcome_emails.state = 'claimed'
    AND lease_expires_at < v_now
    AND public.app_14da0f1941_welcome_emails.delivery_phase IS DISTINCT FROM 'pre_send';

  -- Paso B: reclamo atómico. Sólo filas 'pending'/'failed', o 'claimed' con
  -- lease caducado y fase 'pre_send' (no-transmisión demostrada).
  UPDATE public.app_14da0f1941_welcome_emails
    SET state            = 'claimed',
        attempts         = public.app_14da0f1941_welcome_emails.attempts + 1,
        claimed_at       = v_now,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        last_error       = NULL,
        updated_at       = v_now,
        claim_id         = gen_random_uuid(),
        delivery_phase   = 'pre_send'
  WHERE user_id = p_user_id
    AND (
      public.app_14da0f1941_welcome_emails.state IN ('pending','failed')
      OR (
        public.app_14da0f1941_welcome_emails.state = 'claimed'
        AND public.app_14da0f1941_welcome_emails.lease_expires_at < v_now
        AND public.app_14da0f1941_welcome_emails.delivery_phase = 'pre_send'
      )
    )
    AND public.app_14da0f1941_welcome_emails.attempts < p_max_attempts
  RETURNING * INTO v_row;

  IF v_row.user_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_row.state, v_row.attempts, 'claimed'::text,
                        v_row.claim_id, v_row.delivery_phase,
                        v_row.account_type, v_row.lang;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.app_14da0f1941_welcome_emails
  WHERE user_id = p_user_id;

  IF v_row.user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 0, 'not_enqueued', NULL::uuid, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    false,
    v_row.state,
    v_row.attempts,
    CASE
      WHEN v_row.state = 'sent'      THEN 'already_sent'
      WHEN v_row.state = 'skipped'   THEN 'skipped'
      WHEN v_row.state = 'ambiguous' THEN 'ambiguous_requires_manual_review'
      WHEN v_row.state = 'claimed'   THEN 'in_progress_elsewhere'
      WHEN v_row.attempts >= p_max_attempts THEN 'max_attempts_exhausted'
      ELSE 'not_claimable'
    END::text,
    NULL::uuid,
    v_row.delivery_phase,
    v_row.account_type,
    v_row.lang;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_claim_welcome_email(uuid, integer, integer) IS
  'PB-WELCOME-EMAIL-001: reclamo atómico del correo de bienvenida. already_sent y ambiguous nunca vuelven a reclamarse, de modo que ningún reintento puede producir un segundo envío.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_welcome_email(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_welcome_email(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_claim_welcome_email(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_claim_welcome_email(uuid, integer, integer) TO service_role;

DROP FUNCTION IF EXISTS public.app_14da0f1941_mark_welcome_email_phase(uuid, uuid, text);
CREATE FUNCTION public.app_14da0f1941_mark_welcome_email_phase(
  p_user_id  uuid,
  p_claim_id uuid,
  p_phase    text
)
RETURNS TABLE (marked boolean, delivery_phase text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_welcome_emails;
BEGIN
  IF p_user_id IS NULL OR p_claim_id IS NULL
     OR p_phase NOT IN ('pre_send','send_started') THEN
    RETURN QUERY SELECT false, NULL::text, 'invalid_arguments'::text;
    RETURN;
  END IF;

  UPDATE public.app_14da0f1941_welcome_emails
  SET delivery_phase = p_phase,
      updated_at     = now()
  WHERE user_id = p_user_id
    AND claim_id = p_claim_id
    AND public.app_14da0f1941_welcome_emails.state = 'claimed'
  RETURNING * INTO v_row;

  IF v_row.user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'claim_not_found_or_not_claimed'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.delivery_phase, 'marked'::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_mark_welcome_email_phase(uuid, uuid, text) IS
  'PB-WELCOME-EMAIL-001: marca la fase de entrega (pre_send / send_started) del correo de bienvenida.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_mark_welcome_email_phase(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_mark_welcome_email_phase(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_mark_welcome_email_phase(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_mark_welcome_email_phase(uuid, uuid, text) TO service_role;

DROP FUNCTION IF EXISTS public.app_14da0f1941_finalize_welcome_email(uuid, uuid, text, text, text, text, text);
CREATE FUNCTION public.app_14da0f1941_finalize_welcome_email(
  p_user_id      uuid,
  p_claim_id     uuid,
  p_outcome      text,
  p_message_id   text DEFAULT NULL,
  p_last_error   text DEFAULT NULL,
  p_account_type text DEFAULT NULL,
  p_lang         text DEFAULT NULL
)
RETURNS TABLE (finalized boolean, state text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row   public.app_14da0f1941_welcome_emails;
  v_state text;
BEGIN
  IF p_user_id IS NULL OR p_claim_id IS NULL
     OR p_outcome NOT IN ('sent','failed','ambiguous','skipped') THEN
    RETURN QUERY SELECT false, NULL::text, 'invalid_arguments'::text;
    RETURN;
  END IF;

  v_state := p_outcome;

  UPDATE public.app_14da0f1941_welcome_emails
  SET state        = v_state,
      sent_at      = CASE WHEN p_outcome = 'sent' THEN now() ELSE sent_at END,
      message_id   = CASE WHEN p_outcome = 'sent' THEN p_message_id ELSE message_id END,
      last_error   = CASE WHEN p_outcome = 'sent' THEN NULL ELSE left(p_last_error, 500) END,
      -- Se consolida lo realmente resuelto en tiempo de envío (el perfil puede
      -- haber corregido el tipo de cuenta o el idioma tras el encolado).
      account_type = coalesce(
        public.app_14da0f1941_welcome_normalize_account_type(p_account_type),
        public.app_14da0f1941_welcome_emails.account_type
      ),
      lang         = coalesce(nullif(trim(p_lang), ''), public.app_14da0f1941_welcome_emails.lang),
      updated_at   = now()
  WHERE user_id = p_user_id
    AND claim_id = p_claim_id
    AND public.app_14da0f1941_welcome_emails.state = 'claimed'
  RETURNING * INTO v_row;

  IF v_row.user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'claim_not_found_or_not_claimed'::text;
    RETURN;
  END IF;

  PERFORM public.app_14da0f1941_log_welcome_email_event(
    'delivery_' || p_outcome, v_row.account_type, v_row.lang, v_row.source,
    CASE WHEN p_outcome = 'sent' THEN NULL ELSE left(p_last_error, 120) END
  );

  RETURN QUERY SELECT true, v_row.state, 'finalized'::text;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_finalize_welcome_email(uuid, uuid, text, text, text, text, text) IS
  'PB-WELCOME-EMAIL-001: finaliza el envío del correo de bienvenida (sent/failed/ambiguous/skipped) y consolida tipo de cuenta e idioma resueltos en tiempo de envío.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_welcome_email(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_welcome_email(uuid, uuid, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_finalize_welcome_email(uuid, uuid, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_finalize_welcome_email(uuid, uuid, text, text, text, text, text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. Listado de pendientes para el drenador (sweep)
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.app_14da0f1941_list_pending_welcome_emails(integer, integer);
CREATE FUNCTION public.app_14da0f1941_list_pending_welcome_emails(
  p_limit        integer DEFAULT 20,
  p_max_attempts integer DEFAULT 3
)
RETURNS TABLE (user_id uuid, state text, attempts integer, account_type text, lang text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT w.user_id, w.state, w.attempts, w.account_type, w.lang
  FROM public.app_14da0f1941_welcome_emails w
  WHERE w.attempts < greatest(coalesce(p_max_attempts, 3), 1)
    AND (
      w.state IN ('pending','failed')
      -- 'claimed' con lease caducado en pre_send: no se transmitió nada, es
      -- seguro recuperarlo. 'ambiguous' y 'sent' quedan EXCLUIDOS siempre.
      OR (w.state = 'claimed' AND w.lease_expires_at < now() AND w.delivery_phase = 'pre_send')
    )
  ORDER BY w.created_at
  LIMIT greatest(least(coalesce(p_limit, 20), 200), 1);
$$;

COMMENT ON FUNCTION public.app_14da0f1941_list_pending_welcome_emails(integer, integer) IS
  'PB-WELCOME-EMAIL-001: lista los correos de bienvenida drenables. Excluye por construcción sent y ambiguous.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_list_pending_welcome_emails(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_list_pending_welcome_emails(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_list_pending_welcome_emails(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_list_pending_welcome_emails(integer, integer) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. Interruptor de producción y rollback inmediato
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.app_14da0f1941_set_welcome_email_enabled(boolean, text);
CREATE FUNCTION public.app_14da0f1941_set_welcome_email_enabled(
  p_enabled boolean,
  p_note    text DEFAULT NULL
)
-- Los nombres de salida llevan sufijo _out: si coincidieran con las columnas de
-- la tabla, PostgreSQL resolvería "enabled_at" como ambiguo dentro del UPDATE.
RETURNS TABLE (enabled_out boolean, enabled_at_out timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.app_14da0f1941_welcome_email_config;
BEGIN
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'p_enabled is required';
  END IF;

  UPDATE public.app_14da0f1941_welcome_email_config AS cfg
  SET enabled = p_enabled,
      -- Al ACTIVAR se mueve el suelo a now(): todo lo confirmado antes queda
      -- excluido para siempre. Al DESACTIVAR se conserva el valor anterior
      -- sólo como dato de auditoría; el cerrojo `enabled` ya corta el encolado.
      enabled_at = CASE WHEN p_enabled THEN now() ELSE cfg.enabled_at END,
      updated_at = now(),
      note       = left(p_note, 500)
  WHERE cfg.id = true
  RETURNING cfg.* INTO v_row;

  PERFORM public.app_14da0f1941_log_welcome_email_event(
    CASE WHEN p_enabled THEN 'feature_enabled' ELSE 'feature_disabled' END,
    NULL, NULL, 'admin', NULL
  );

  RETURN QUERY SELECT v_row.enabled, v_row.enabled_at;
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_set_welcome_email_enabled(boolean, text) IS
  'PB-WELCOME-EMAIL-001: activa/desactiva el correo de bienvenida. Al activar fija el suelo anti-retroactividad en now(). Desactivar es el ROLLBACK inmediato: deja de encolarse al instante y no se acumula backlog.';

REVOKE ALL ON FUNCTION public.app_14da0f1941_set_welcome_email_enabled(boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_14da0f1941_set_welcome_email_enabled(boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.app_14da0f1941_set_welcome_email_enabled(boolean, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_set_welcome_email_enabled(boolean, text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. Métricas agregadas de conversión (sin PII)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.app_14da0f1941_welcome_email_funnel
WITH (security_invoker = true) AS
  SELECT
    date_trunc('day', w.created_at)::date AS day,
    w.account_type,
    w.lang,
    count(*)                                             AS enqueued,
    count(*) FILTER (WHERE w.state = 'sent')             AS sent,
    count(*) FILTER (WHERE w.state = 'failed')           AS failed,
    count(*) FILTER (WHERE w.state = 'ambiguous')        AS ambiguous,
    -- Conversión a perfil activo: de los usuarios que recibieron la bienvenida,
    -- cuántos alcanzaron después marketplace_ready. Es una LECTURA del estado
    -- de Marketplace Ready, nunca una escritura: este flujo no altera EMAIL 1/2.
    count(*) FILTER (WHERE w.state = 'sent' AND p.marketplace_ready IS TRUE) AS reached_marketplace_ready
  FROM public.app_14da0f1941_welcome_emails w
  LEFT JOIN public.app_14da0f1941_profiles p ON p.user_id = w.user_id
  GROUP BY 1, 2, 3;

COMMENT ON VIEW public.app_14da0f1941_welcome_email_funnel IS
  'PB-WELCOME-EMAIL-001: embudo agregado por día/tipo de cuenta/idioma. Sin PII (no expone user_id ni email). security_invoker: sólo service_role puede leerlo por los GRANTs de las tablas base.';

REVOKE ALL ON public.app_14da0f1941_welcome_email_funnel FROM PUBLIC;
REVOKE ALL ON public.app_14da0f1941_welcome_email_funnel FROM anon;
REVOKE ALL ON public.app_14da0f1941_welcome_email_funnel FROM authenticated;
GRANT SELECT ON public.app_14da0f1941_welcome_email_funnel TO service_role;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK OPERATIVO (en orden de agresividad)
--
--   Nivel 1 — Apagado inmediato de la feature (recomendado, sin DDL):
--     SELECT public.app_14da0f1941_set_welcome_email_enabled(false, 'rollback');
--     Deja de encolarse al instante. Las filas ya enviadas se conservan como
--     evidencia y NO se reenvía nada.
--
--   Nivel 2 — Desconectar sólo el disparador automático, conservando datos:
--     DROP TRIGGER IF EXISTS app_14da0f1941_auth_users_welcome_email ON auth.users;
--
--   Nivel 3 — Retirada completa de la migración:
--     DROP TRIGGER IF EXISTS app_14da0f1941_auth_users_welcome_email ON auth.users;
--     DROP VIEW IF EXISTS public.app_14da0f1941_welcome_email_funnel;
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_set_welcome_email_enabled(boolean, text);
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_list_pending_welcome_emails(integer, integer);
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_finalize_welcome_email(uuid, uuid, text, text, text, text, text);
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_mark_welcome_email_phase(uuid, uuid, text);
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_claim_welcome_email(uuid, integer, integer);
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_request_welcome_email();
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_on_auth_email_confirmed();
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_enqueue_welcome_email(text, text);
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_welcome_normalize_account_type(text);
--     DROP FUNCTION IF EXISTS public.app_14da0f1941_log_welcome_email_event(text, text, text, text, text);
--     DROP TABLE IF EXISTS public.app_14da0f1941_welcome_email_events;
--     DROP TABLE IF EXISTS public.app_14da0f1941_welcome_emails;
--     DROP TABLE IF EXISTS public.app_14da0f1941_welcome_email_config;
--
-- Ninguno de los tres niveles toca Marketplace Ready, WhatsApp, consentimientos
-- ni auth.users más allá del trigger propio.
-- ══════════════════════════════════════════════════════════════════════════════
