CREATE TABLE IF NOT EXISTS public.pb_marketplace_reconcile_application_log (
  batch_id text NOT NULL,
  user_id uuid NOT NULL,
  application_id uuid NOT NULL,
  downgrade_event_id uuid NOT NULL REFERENCES public.app_14da0f1941_job_application_events(id),
  rollback_event_id uuid REFERENCES public.app_14da0f1941_job_application_events(id),
  previous_status text NOT NULL CHECK (previous_status = 'applied'),
  new_status text NOT NULL CHECK (new_status = 'pending_profile_validation'),
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, application_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pb_marketplace_reconcile_log_batch_user_unique
  ON public.pb_marketplace_ready_reconcile_log (batch_id, user_id) WHERE dry_run IS FALSE;

ALTER TABLE public.pb_marketplace_ready_reconcile_log
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz;

ALTER TABLE public.pb_marketplace_reconcile_application_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pb_marketplace_reconcile_application_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pb_marketplace_reconcile_application_log TO service_role;

CREATE OR REPLACE FUNCTION public.pb_downgrade_unpresented_applications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_application record;
  v_event_id uuid;
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
           'marketplace_ready lost: profile validation required')
        RETURNING id INTO v_event_id;
        IF v_batch IS NOT NULL THEN
          INSERT INTO public.pb_marketplace_reconcile_application_log
            (batch_id, user_id, application_id, downgrade_event_id, previous_status, new_status)
          VALUES
            (v_batch, NEW.user_id, v_application.id, v_event_id, 'applied', 'pending_profile_validation');
        END IF;
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

CREATE OR REPLACE FUNCTION public.app_14da0f1941_on_marketplace_ready_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app record;
  v_count integer := 0;
  v_titles text[] := ARRAY[]::text[];
BEGIN
  IF nullif(current_setting('pb.marketplace_rollback_batch', true), '') IS NOT NULL
     AND current_setting('pb.marketplace_rollback_enabled', true) = 'true'
     AND (current_setting('role', true) = 'service_role' OR session_user = 'postgres') THEN
    RETURN NULL;
  END IF;
  IF OLD.marketplace_ready IS NOT TRUE AND NEW.marketplace_ready IS TRUE THEN
    FOR v_app IN
      SELECT a.id, a.job_title
      FROM public.app_14da0f1941_job_applications a
      WHERE a.user_id = NEW.user_id
        AND a.status = 'pending_profile_validation'
      FOR UPDATE
    LOOP
      UPDATE public.app_14da0f1941_job_applications
      SET status = 'applied'
      WHERE id = v_app.id;

      INSERT INTO public.app_14da0f1941_job_application_events
        (application_id, from_status, to_status, actor_user_id, actor_role, note)
      VALUES
        (v_app.id, 'pending_profile_validation', 'applied', NULL, 'system',
         'marketplace_ready reached: ready_for_review');

      v_count := v_count + 1;
      IF coalesce(array_length(v_titles, 1), 0) < 10 THEN
        v_titles := array_append(v_titles, coalesce(v_app.job_title, ''));
      END IF;
    END LOOP;

    INSERT INTO public.app_14da0f1941_marketplace_ready_activations
      (user_id, activated_count, activated_job_titles, state, attempts, lease_expires_at)
    VALUES
      (NEW.user_id, v_count, v_titles, 'pending', 0, now());
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.pb_rollback_marketplace_ready(p_batch_id text)
RETURNS TABLE (rollback_batch_id text, profiles_restored integer, applications_restored integer, irreversible_emails integer, already_rolled_back boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_log record;
  v_app record;
  v_email record;
  v_event_id uuid;
  v_profiles integer := 0;
  v_applications integer := 0;
  v_sent integer := 0;
BEGIN
  IF p_batch_id IS NULL OR p_batch_id !~ '^[a-zA-Z0-9_-]{1,80}$'
     OR current_setting('pb.marketplace_rollback_enabled', true) IS DISTINCT FROM 'true'
     OR current_setting('pb.marketplace_reconcile_enabled', true) = 'true' THEN
    RAISE EXCEPTION 'Rollback disabled: explicit batch and transactional authorization required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pb_marketplace_ready_reconcile_log l WHERE l.batch_id = p_batch_id AND l.dry_run IS FALSE) THEN
    RAISE EXCEPTION 'Unknown applied reconciliation batch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pb_marketplace_ready_reconcile_log l
    WHERE l.batch_id = p_batch_id AND l.dry_run IS FALSE
      AND l.applied IS NOT TRUE AND l.rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Incomplete reconciliation log';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pb_marketplace_ready_reconcile_log l
    WHERE l.batch_id = p_batch_id AND l.dry_run IS FALSE AND l.applied IS TRUE
  ) THEN
    RETURN QUERY SELECT p_batch_id, 0, 0,
      (SELECT count(*)::integer FROM public.app_14da0f1941_marketplace_reconcile_emails e
       WHERE e.batch_id = p_batch_id AND e.state = 'sent'), true;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pb_marketplace_ready_reconcile_log l
    WHERE l.batch_id = p_batch_id AND l.dry_run IS FALSE AND l.rolled_back_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Partially rolled back batch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.app_14da0f1941_marketplace_reconcile_emails e
    WHERE e.batch_id = p_batch_id AND e.state IN ('claimed', 'ambiguous')
  ) THEN
    RAISE EXCEPTION 'In-flight or ambiguous email requires manual review';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pb_marketplace_reconcile_application_log a
    LEFT JOIN public.app_14da0f1941_marketplace_reconcile_emails e
      ON e.user_id = a.user_id AND e.batch_id = a.batch_id
    WHERE a.batch_id = p_batch_id AND (e.user_id IS NULL OR e.downgraded_count <> (
      SELECT count(*) FROM public.pb_marketplace_reconcile_application_log b
      WHERE b.batch_id = a.batch_id AND b.user_id = a.user_id
    ))
  ) THEN
    RAISE EXCEPTION 'Application audit or email count mismatch';
  END IF;

  FOR v_log IN
    SELECT l.* FROM public.pb_marketplace_ready_reconcile_log l
    WHERE l.batch_id = p_batch_id AND l.dry_run IS FALSE AND l.applied IS TRUE
    ORDER BY l.user_id FOR UPDATE
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.app_14da0f1941_profiles p
      WHERE p.user_id = v_log.user_id AND p.marketplace_contract_version = 2
        AND p.marketplace_ready IS NOT DISTINCT FROM v_log.new_ready
        AND p.onboarding_status IS NOT DISTINCT FROM v_log.new_status
        AND p.profile_completion IS NOT DISTINCT FROM v_log.new_completion
        AND p.marketplace_consent_declared IS TRUE
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'Profile changed since reconciliation';
    END IF;

    FOR v_app IN
      SELECT a.*, e.created_at AS downgrade_created_at FROM public.pb_marketplace_reconcile_application_log a
      JOIN public.app_14da0f1941_job_application_events e ON e.id = a.downgrade_event_id
      WHERE a.batch_id = p_batch_id AND a.user_id = v_log.user_id AND a.rolled_back_at IS NULL
      ORDER BY a.application_id
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.app_14da0f1941_job_applications j
        WHERE j.id = v_app.application_id AND j.user_id = v_log.user_id AND j.status = v_app.new_status
        FOR UPDATE
      ) OR EXISTS (
        SELECT 1 FROM public.app_14da0f1941_job_application_events e
        WHERE e.application_id = v_app.application_id AND e.id <> v_app.downgrade_event_id
          AND e.created_at > v_app.downgrade_created_at
      ) THEN
        RAISE EXCEPTION 'Application changed since reconciliation';
      END IF;
    END LOOP;

    PERFORM set_config('pb.marketplace_rollback_batch', p_batch_id, true);
    UPDATE public.app_14da0f1941_profiles p
    SET marketplace_contract_version = v_log.prev_contract_version,
        marketplace_ready = v_log.prev_ready,
        onboarding_status = v_log.prev_status,
        profile_completion = v_log.prev_completion,
        marketplace_consent_declared = v_log.prev_consent_declared
    WHERE p.user_id = v_log.user_id;
    PERFORM set_config('pb.marketplace_rollback_batch', '', true);

    FOR v_app IN
      SELECT a.* FROM public.pb_marketplace_reconcile_application_log a
      WHERE a.batch_id = p_batch_id AND a.user_id = v_log.user_id AND a.rolled_back_at IS NULL
      ORDER BY a.application_id FOR UPDATE
    LOOP
      UPDATE public.app_14da0f1941_job_applications j
      SET status = v_app.previous_status
      WHERE j.id = v_app.application_id AND j.user_id = v_log.user_id AND j.status = v_app.new_status;
      IF NOT FOUND THEN RAISE EXCEPTION 'Application changed during rollback'; END IF;
      INSERT INTO public.app_14da0f1941_job_application_events
        (application_id, from_status, to_status, actor_user_id, actor_role, note)
      VALUES
        (v_app.application_id, v_app.new_status, v_app.previous_status, NULL, 'system',
         'marketplace_ready rollback batch ' || p_batch_id)
      RETURNING id INTO v_event_id;
      UPDATE public.pb_marketplace_reconcile_application_log a
      SET rolled_back_at = now(), rollback_event_id = v_event_id
      WHERE a.batch_id = p_batch_id AND a.application_id = v_app.application_id;
      v_applications := v_applications + 1;
    END LOOP;
    UPDATE public.pb_marketplace_ready_reconcile_log l
    SET applied = false, rolled_back_at = now()
    WHERE l.id = v_log.id;
    v_profiles := v_profiles + 1;
  END LOOP;

  UPDATE public.app_14da0f1941_marketplace_reconcile_emails e
  SET state = 'skipped', last_error = 'batch_rolled_back', updated_at = now()
  WHERE e.batch_id = p_batch_id AND e.state IN ('pending', 'failed');
  SELECT count(*)::integer INTO v_sent FROM public.app_14da0f1941_marketplace_reconcile_emails e
  WHERE e.batch_id = p_batch_id AND e.state = 'sent';
  RETURN QUERY SELECT p_batch_id, v_profiles, v_applications, v_sent, false;
END $$;

REVOKE ALL ON FUNCTION public.pb_rollback_marketplace_ready(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pb_rollback_marketplace_ready(text) TO service_role;
