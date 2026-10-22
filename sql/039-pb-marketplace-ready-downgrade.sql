CREATE TABLE IF NOT EXISTS public.app_14da0f1941_marketplace_reconcile_emails (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  batch_id text NOT NULL,
  downgraded_count integer NOT NULL CHECK (downgraded_count > 0),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'sent', 'failed', 'ambiguous', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  claim_id uuid,
  delivery_phase text CHECK (delivery_phase IN ('pre_send', 'send_started')),
  lease_expires_at timestamptz,
  sent_at timestamptz,
  message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_14da0f1941_marketplace_reconcile_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_14da0f1941_marketplace_reconcile_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_14da0f1941_marketplace_reconcile_emails TO service_role;

CREATE OR REPLACE FUNCTION public.pb_downgrade_unpresented_applications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_application record;
  v_count integer := 0;
  v_batch text := nullif(current_setting('pb.marketplace_reconcile_batch', true), '');
BEGIN
  IF OLD.marketplace_ready IS TRUE AND NEW.marketplace_ready IS NOT TRUE THEN
    FOR v_application IN
      SELECT a.id
      FROM public.app_14da0f1941_job_applications a
      WHERE a.user_id = NEW.user_id
        AND a.status = 'applied'
        AND NOT EXISTS (
          SELECT 1 FROM public.app_14da0f1941_job_application_events e
          WHERE e.application_id = a.id AND e.to_status = 'sent_to_client'
        )
      FOR UPDATE OF a
    LOOP
      UPDATE public.app_14da0f1941_job_applications
      SET status = 'pending_profile_validation'
      WHERE id = v_application.id AND status = 'applied';

      IF FOUND THEN
        INSERT INTO public.app_14da0f1941_job_application_events
          (application_id, from_status, to_status, actor_user_id, actor_role, note)
        VALUES
          (v_application.id, 'applied', 'pending_profile_validation', NULL, 'system',
           'marketplace_ready lost: profile validation required');
        v_count := v_count + 1;
      END IF;
    END LOOP;

    IF v_batch IS NOT NULL AND v_count > 0 THEN
      INSERT INTO public.app_14da0f1941_marketplace_reconcile_emails (user_id, batch_id, downgraded_count)
      VALUES (NEW.user_id, v_batch, v_count)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS pb_profiles_downgrade_unpresented_applications
  ON public.app_14da0f1941_profiles;
CREATE TRIGGER pb_profiles_downgrade_unpresented_applications
  AFTER UPDATE OF marketplace_ready ON public.app_14da0f1941_profiles
  FOR EACH ROW EXECUTE FUNCTION public.pb_downgrade_unpresented_applications();

REVOKE ALL ON FUNCTION public.pb_downgrade_unpresented_applications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_downgrade_unpresented_applications() TO service_role;

CREATE OR REPLACE FUNCTION public.pb_claim_marketplace_reconcile_email(
  p_user_id uuid,
  p_max_attempts integer DEFAULT 3,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (claimed boolean, state text, claim_id uuid, reason text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.app_14da0f1941_marketplace_reconcile_emails;
BEGIN
  IF p_user_id IS NULL OR p_max_attempts < 1 OR p_lease_seconds < 1 THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid, 'invalid_arguments'::text;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.app_14da0f1941_marketplace_reconcile_emails
  WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::uuid, 'not_found'::text;
    RETURN;
  END IF;

  IF v_row.state = 'claimed' AND v_row.lease_expires_at < now()
     AND v_row.delivery_phase IS DISTINCT FROM 'pre_send' THEN
    UPDATE public.app_14da0f1941_marketplace_reconcile_emails
    SET state = 'ambiguous', last_error = 'lease_expired_after_send_started', updated_at = now()
    WHERE user_id = p_user_id;
    RETURN QUERY SELECT false, 'ambiguous'::text, NULL::uuid, 'manual_review'::text;
    RETURN;
  END IF;

  IF v_row.attempts >= p_max_attempts OR NOT (
    v_row.state IN ('pending', 'failed') OR
    (v_row.state = 'claimed' AND v_row.lease_expires_at < now() AND v_row.delivery_phase = 'pre_send')
  ) THEN
    RETURN QUERY SELECT false, v_row.state, NULL::uuid, 'not_claimable'::text;
    RETURN;
  END IF;

  UPDATE public.app_14da0f1941_marketplace_reconcile_emails
  SET state = 'claimed', attempts = v_row.attempts + 1, claim_id = gen_random_uuid(),
      delivery_phase = 'pre_send', lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error = NULL, updated_at = now()
  WHERE user_id = p_user_id RETURNING * INTO v_row;

  RETURN QUERY SELECT true, v_row.state, v_row.claim_id, 'claimed'::text;
END $$;

CREATE OR REPLACE FUNCTION public.pb_mark_marketplace_reconcile_email_send(
  p_user_id uuid, p_claim_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_14da0f1941_marketplace_reconcile_emails
  SET delivery_phase = 'send_started', updated_at = now()
  WHERE user_id = p_user_id AND claim_id = p_claim_id
    AND state = 'claimed' AND delivery_phase = 'pre_send' AND lease_expires_at > now();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.pb_finalize_marketplace_reconcile_email(
  p_user_id uuid, p_claim_id uuid, p_outcome text,
  p_message_id text DEFAULT NULL, p_last_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_outcome NOT IN ('sent', 'failed', 'skipped') THEN RETURN false; END IF;
  UPDATE public.app_14da0f1941_marketplace_reconcile_emails
  SET state = CASE WHEN p_outcome = 'sent' THEN 'sent'
                   WHEN delivery_phase = 'send_started' THEN 'ambiguous'
                   WHEN p_outcome = 'skipped' THEN 'skipped'
                   ELSE 'failed' END,
      sent_at = CASE WHEN p_outcome = 'sent' THEN now() ELSE sent_at END,
      message_id = CASE WHEN p_outcome = 'sent' THEN p_message_id ELSE message_id END,
      last_error = p_last_error,
      updated_at = now()
  WHERE user_id = p_user_id AND claim_id = p_claim_id AND state = 'claimed'
    AND (p_outcome <> 'sent' OR delivery_phase = 'send_started');
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.pb_claim_marketplace_reconcile_email(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pb_mark_marketplace_reconcile_email_send(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pb_finalize_marketplace_reconcile_email(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_claim_marketplace_reconcile_email(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pb_mark_marketplace_reconcile_email_send(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pb_finalize_marketplace_reconcile_email(uuid, uuid, text, text, text) TO service_role;
