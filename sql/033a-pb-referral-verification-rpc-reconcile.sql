-- Reconciliación de trazabilidad PB-NOTIFICATIONS-RPC-RELATION-HARDENING-001.
--
-- Contexto: la RPC pb_verify_referral_if_eligible se creó en QA por consulta
-- directa y quedó fuera del registro de migraciones (la entrada 20261013193935
-- solo registró el DROP POLICY + REVOKE, sin nombre ni la función).
--
-- Esta migración es IDEMPOTENTE y re-asegura el estado final: policy UPDATE
-- cerrada + RPC de verificación con validación server-side y transición
-- pending -> verified idempotente. Reproducible en un entorno limpio.

DROP POLICY IF EXISTS allow_update_own_referrals ON public.app_14da0f1941_referrals;
REVOKE UPDATE ON public.app_14da0f1941_referrals FROM authenticated, anon;

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

  SELECT * INTO v_referral
    FROM public.app_14da0f1941_referrals
   WHERE referred_id = v_uid
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_referral');
  END IF;

  IF v_referral.status = 'verified' AND v_referral.verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'referral_id', v_referral.id, 'referrer_id', v_referral.referrer_id, 'already_verified', true);
  END IF;

  IF v_referral.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_state', 'status', v_referral.status);
  END IF;

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

  UPDATE public.app_14da0f1941_referrals
     SET status = 'verified', verified_at = now()
   WHERE id = v_referral.id AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'referral_id', v_referral.id, 'referrer_id', v_referral.referrer_id, 'already_verified', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pb_verify_referral_if_eligible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_verify_referral_if_eligible() TO authenticated;
