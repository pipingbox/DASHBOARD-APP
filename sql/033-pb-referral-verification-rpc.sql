-- PB-NOTIFICATIONS-RPC-RELATION-HARDENING-001 (revisión 4, hallazgo P1 adicional)
-- Verificación de referidos movida a una operación segura del backend y cierre
-- del UPDATE directo de status/verified_at desde el navegador.
--
-- Vectores cerrados:
--  1. UPDATE directo de status/verified_at por un autenticado (en producción,
--     via sql/028 allow_update_own_referrals): un referido podía falsificar su
--     propia verificación. Ahora UPDATE de esas columnas es service-only.
--  2. La verificación la hacía el navegador (verifyReferralIfEligible con
--     PostgREST .update()). Ahora la hace la RPC pb_verify_referral_if_eligible
--     SECURITY DEFINER, que valida las condiciones reales en BD/Auth y realiza
--     la transición pending -> verified de forma idempotente.
--  3. Recompensas: checkPremiumStatus contaba tambien 'pending'. Se endurece
--     en el frontend para contar solo verified/completed (cambio frontend,
--     no en esta migración).
--
-- La lectura RLS existente (SELECT propio) no se toca. El flujo legítimo se
-- conserva: el referido autenticado invoca la RPC; si cumple las condiciones
-- reales, la RPC marca verified_at (servidor) y devuelve el referral_id para
-- la notificación. Si no las cumple, devuelve ok=false sin escribir nada.

-- 1) Cerrar UPDATE directo de referrals para authenticated (lectura intacta).
DROP POLICY IF EXISTS allow_update_own_referrals ON public.app_14da0f1941_referrals;
REVOKE UPDATE ON public.app_14da0f1941_referrals FROM authenticated, anon;

-- 2) RPC segura de verificación. Solo promueve pending -> verified cuando el
--    referido autenticado cumple las condiciones reales (email confirmado en
--    Auth + onboarding completo o actividad mínima). Idempotente: si ya está
--    verified, devuelve la fila sin volver a escribir.
CREATE OR REPLACE FUNCTION public.pb_verify_referral_if_eligible()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_referral public.app_14da0f1941_referrals%ROWTYPE;
  v_email_confirmed boolean;
  v_full_name text;
  v_title text;
  v_skills text[];
  v_activity bigint;
  v_cert bigint;
  v_has_onboarding boolean;
  v_has_activity boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- La relación pendiente donde el llamante es el referido.
  SELECT * INTO v_referral
    FROM public.app_14da0f1941_referrals
   WHERE referred_id = v_uid
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_referral');
  END IF;

  -- Idempotencia: ya verificado -> no-op, devolver estado.
  IF v_referral.status = 'verified' AND v_referral.verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'referral_id', v_referral.id, 'referrer_id', v_referral.referrer_id, 'already_verified', true);
  END IF;

  IF v_referral.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_state', 'status', v_referral.status);
  END IF;

  -- Condiciones reales verificadas en servidor.
  SELECT (u.email_confirmed_at IS NOT NULL) INTO v_email_confirmed
    FROM auth.users AS u WHERE u.id = v_uid;

  SELECT p.full_name, p.title, p.skills INTO v_full_name, v_title, v_skills
    FROM public.app_14da0f1941_profiles AS p WHERE p.user_id = v_uid;

  SELECT COUNT(*) INTO v_activity
    FROM public.app_14da0f1941_tool_usage AS t WHERE t.user_id = v_uid;

  SELECT COUNT(*) INTO v_cert
    FROM public.app_worker_certifications AS c WHERE c.user_id = v_uid;

  v_has_onboarding := (v_full_name IS NOT NULL AND BTRIM(v_full_name) <> ''
                       AND (v_title IS NOT NULL OR (v_skills IS NOT NULL AND cardinality(v_skills) > 0)));
  v_has_activity := (COALESCE(v_activity, 0) >= 1 OR COALESCE(v_cert, 0) >= 1);

  IF NOT (COALESCE(v_email_confirmed, false) AND (v_has_onboarding OR v_has_activity)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_eligible',
      'email_confirmed', COALESCE(v_email_confirmed, false),
      'has_onboarding', v_has_onboarding, 'has_activity', v_has_activity);
  END IF;

  -- Transición pending -> verified con verified_at generado en servidor.
  UPDATE public.app_14da0f1941_referrals
     SET status = 'verified', verified_at = now()
   WHERE id = v_referral.id AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'referral_id', v_referral.id, 'referrer_id', v_referral.referrer_id, 'already_verified', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pb_verify_referral_if_eligible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_verify_referral_if_eligible() TO authenticated;
