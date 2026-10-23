-- ══════════════════════════════════════════════════════════════════════════════
-- PB-WHATSAPP-FOUNDATION-001 — FIX PACK 1 (revision M1, M2, L1, L3, L4)
--
-- Migracion INCREMENTAL sobre 042 (ya aplicada en QA). Idempotente.
--
-- M1/L1: limites de envio (rate limit + cooldown) y de verificacion ATOMICOS
--   mediante tabla de throttle + RPCs con SELECT ... FOR UPDATE. La via
--   anterior (count-then-insert sobre phone_verifications) era TOCTOU y la
--   ruta de OTP expirado no consumia presupuesto: permitia escrituras
--   ilimitadas de auditoria. Ahora el gate de verificacion rechaza (429) una
--   vez agotada la ventana y la ruta expirada tambien consume attempt.
--
-- M2: el provider MOCK exige TRES condiciones (fail-safe por omision):
--   1) config.provider = 'mock';
--   2) config.mock_enabled = true (columna nueva; una fila 'mock' ya NO basta);
--   3) el project ref actual esta en la allowlist del codigo (solo QA).
--   Sin provider configurado el comportamiento sigue siendo el 503 controlado
--   sms_provider_not_configured.
--
-- L3: whatsapp_opted_out_at conserva la fecha de la ultima revocacion
--   efectiva aunque el usuario reactive un opt-in despues (cambio solo en la
--   edge function; aqui queda documentada la semantica).
--
-- L4: retencion configurable (phone_ops_config) + RPC de purga:
--   * phone_verifications: 30 dias (trazabilidad de challenges razonable sin
--     acumular hashes indefinidamente; el ciclo de vida real es minutos);
--   * phone_provider_outbox: 7 dias (capturas QA con OTP efimero de 10 min;
--     solo existen con provider mock);
--   NUNCA se purga phone_events (auditoria) ni datos de consentimiento.
--
-- Seguridad: tablas service_role-only (RLS sin policies para clientes);
-- REVOKE EXECUTE FROM PUBLIC/anon/authenticated en las RPCs nuevas;
-- GRANT EXECUTE solo a service_role. Sin SECURITY DEFINER.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THROTTLE ATOMICO (M1 + L1)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_phone_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  send_window_start timestamptz,
  send_count integer NOT NULL DEFAULT 0,
  last_send_at timestamptz,
  verify_window_start timestamptz,
  verify_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.app_14da0f1941_phone_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_14da0f1941_phone_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_14da0f1941_phone_rate_limits TO service_role;

COMMENT ON TABLE public.app_14da0f1941_phone_rate_limits IS
  'PB-WHATSAPP-FOUNDATION-001 FIX1: throttle atomico por usuario para envios OTP (ventana + cooldown) y verificaciones (ventana). Solo service_role via RPCs pb_phone_send_gate / pb_phone_verify_gate (FOR UPDATE).';

-- Gate de envio: cooldown + rate limit por ventana, atomico (row lock).
CREATE OR REPLACE FUNCTION public.pb_phone_send_gate(
  p_user_id uuid,
  p_max_per_window integer,
  p_window_seconds integer,
  p_cooldown_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row public.app_14da0f1941_phone_rate_limits%ROWTYPE;
  v_now timestamptz := now();
  v_retry integer;
BEGIN
  INSERT INTO public.app_14da0f1941_phone_rate_limits (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.app_14da0f1941_phone_rate_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Cooldown de reenvio.
  IF v_row.last_send_at IS NOT NULL
     AND v_now < v_row.last_send_at + make_interval(secs => p_cooldown_seconds) THEN
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.last_send_at + make_interval(secs => p_cooldown_seconds) - v_now)))::integer);
    RETURN jsonb_build_object('allowed', false, 'reason', 'resend_cooldown', 'retry_after_seconds', v_retry);
  END IF;

  -- Ventana deslizante por arranque fijo: si expiro, se reinicia.
  IF v_row.send_window_start IS NULL
     OR v_now >= v_row.send_window_start + make_interval(secs => p_window_seconds) THEN
    v_row.send_window_start := v_now;
    v_row.send_count := 0;
  END IF;

  IF v_row.send_count >= p_max_per_window THEN
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.send_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
    RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limit_exceeded', 'retry_after_seconds', v_retry);
  END IF;

  UPDATE public.app_14da0f1941_phone_rate_limits
  SET send_window_start = v_row.send_window_start,
      send_count = v_row.send_count + 1,
      last_send_at = v_now
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- Gate de verificacion: maximo de intentos de verify por ventana. Rechazar
-- (no solo contar) es lo que impide escrituras ilimitadas en auditoria (M1).
CREATE OR REPLACE FUNCTION public.pb_phone_verify_gate(
  p_user_id uuid,
  p_max_per_window integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row public.app_14da0f1941_phone_rate_limits%ROWTYPE;
  v_now timestamptz := now();
  v_retry integer;
BEGIN
  INSERT INTO public.app_14da0f1941_phone_rate_limits (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.app_14da0f1941_phone_rate_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_row.verify_window_start IS NULL
     OR v_now >= v_row.verify_window_start + make_interval(secs => p_window_seconds) THEN
    v_row.verify_window_start := v_now;
    v_row.verify_count := 0;
  END IF;

  IF v_row.verify_count >= p_max_per_window THEN
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.verify_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
    RETURN jsonb_build_object('allowed', false, 'reason', 'verify_rate_limited', 'retry_after_seconds', v_retry);
  END IF;

  UPDATE public.app_14da0f1941_phone_rate_limits
  SET verify_window_start = v_row.verify_window_start,
      verify_count = v_row.verify_count + 1
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.pb_phone_send_gate(uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pb_phone_verify_gate(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_phone_send_gate(uuid, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pb_phone_verify_gate(uuid, integer, integer) TO service_role;

COMMENT ON FUNCTION public.pb_phone_send_gate(uuid, integer, integer, integer) IS
  'PB-WHATSAPP-FOUNDATION-001 FIX1: gate atomico (FOR UPDATE) de envio OTP: cooldown + max por ventana. Devuelve {allowed, reason, retry_after_seconds}.';
COMMENT ON FUNCTION public.pb_phone_verify_gate(uuid, integer, integer) IS
  'PB-WHATSAPP-FOUNDATION-001 FIX1 (M1): gate atomico de verificaciones OTP por ventana; agotada la ventana RECHAZA (429), bloqueando escrituras ilimitadas en auditoria.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. M2: mock_enabled (una fila provider='mock' ya no basta)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.app_14da0f1941_phone_provider_config
  ADD COLUMN IF NOT EXISTS mock_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_14da0f1941_phone_provider_config.mock_enabled IS
  'PB-WHATSAPP-FOUNDATION-001 FIX1 (M2): barrera 2 de 3 para activar el mock (ademas de provider=mock y del project ref en allowlist del codigo). Default false: fail-safe.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. L4: retencion configurable + purga (NUNCA phone_events ni consentimiento)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_14da0f1941_phone_ops_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_14da0f1941_phone_ops_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_14da0f1941_phone_ops_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_14da0f1941_phone_ops_config TO service_role;

COMMENT ON TABLE public.app_14da0f1941_phone_ops_config IS
  'PB-WHATSAPP-FOUNDATION-001 FIX1 (L4): configuracion operativa (retenciones). Service_role-only.';

INSERT INTO public.app_14da0f1941_phone_ops_config (key, value) VALUES
  ('phone_verifications_retention_days', '30'),
  ('phone_provider_outbox_retention_days', '7')
ON CONFLICT (key) DO NOTHING;

-- Purga de retencion. Challenges: 30 dias (su ciclo real son minutos; 30 dias
-- da trazabilidad razonable sin acumular hashes). Capturas QA: 7 dias
-- (contienen el OTP efimero porque son el transporte simulado; solo existen
-- con provider mock). phone_events y consentimiento NO se purgan jamas.
CREATE OR REPLACE FUNCTION public.pb_phone_purge_retention()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_verif_days integer;
  v_outbox_days integer;
  v_verif_deleted integer;
  v_outbox_deleted integer;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::integer, 30) INTO v_verif_days
  FROM public.app_14da0f1941_phone_ops_config
  WHERE key = 'phone_verifications_retention_days';
  v_verif_days := COALESCE(v_verif_days, 30);

  SELECT COALESCE(NULLIF(value, '')::integer, 7) INTO v_outbox_days
  FROM public.app_14da0f1941_phone_ops_config
  WHERE key = 'phone_provider_outbox_retention_days';
  v_outbox_days := COALESCE(v_outbox_days, 7);

  DELETE FROM public.app_14da0f1941_phone_verifications
  WHERE created_at < now() - make_interval(days => v_verif_days);
  GET DIAGNOSTICS v_verif_deleted = ROW_COUNT;

  DELETE FROM public.app_14da0f1941_phone_provider_outbox
  WHERE created_at < now() - make_interval(days => v_outbox_days);
  GET DIAGNOSTICS v_outbox_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'phone_verifications_deleted', v_verif_deleted,
    'phone_verifications_retention_days', v_verif_days,
    'phone_provider_outbox_deleted', v_outbox_deleted,
    'phone_provider_outbox_retention_days', v_outbox_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pb_phone_purge_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_phone_purge_retention() TO service_role;

COMMENT ON FUNCTION public.pb_phone_purge_retention() IS
  'PB-WHATSAPP-FOUNDATION-001 FIX1 (L4): purga por retencion configurable (phone_ops_config). Borra challenges y capturas QA antiguos. NUNCA phone_events ni consentimiento. Invocar via service_role (pg_cron en produccion).';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACION POST-DDL (informativa)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'app_14da0f1941_phone%';
-- SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'pb_phone_%';
-- SELECT has_function_privilege('authenticated', 'public.pb_phone_send_gate(uuid,integer,integer,integer)', 'EXECUTE'); -- false
