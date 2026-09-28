-- PB-JOBS-ATS-001: Mini-ATS — application status history + attribution
--
-- Additive-only migration. No drops, no retypes, no weakening of RLS.
--
-- 1. app_14da0f1941_job_application_events: full audit trail of every status
--    change (application, from/to status, actor, server timestamp, note).
--    History is never deleted to correct errors; corrections are new events.
--
-- 2. Attribution columns on job_applications: acquisition channel of the
--    candidate (utm_source/medium/campaign/content, sanitized, bounded).
--    "Unknown" when no reliable attribution exists. No historical backfill.
--
-- 3. assigned_to: recruitment follow-up owner for the application.
--
-- 4. app_update_application_status RPC: transactional status change +
--    history insert, idempotent on same (application_id, new_status) retries,
--    server-side authorization (admin / jobs_moderator / owning company),
--    and no-op when the application is already in the target status.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS app_update_application_status(uuid, text, text);
--   DROP TABLE IF EXISTS app_14da0f1941_job_application_events;
--   ALTER TABLE app_14da0f1941_job_applications
--     DROP COLUMN IF EXISTS assigned_to,
--     DROP COLUMN IF EXISTS utm_source,
--     DROP COLUMN IF EXISTS utm_medium,
--     DROP COLUMN IF EXISTS utm_campaign,
--     DROP COLUMN IF EXISTS utm_content;

-- ---------------------------------------------------------------------------
-- 1. Application events (audit history)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_14da0f1941_job_application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES app_14da0f1941_job_applications(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid,
  actor_role text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_application_events_app_idx
  ON app_14da0f1941_job_application_events (application_id, created_at);

ALTER TABLE app_14da0f1941_job_application_events ENABLE ROW LEVEL SECURITY;

-- Candidate reads only their own application's events (public labels only —
-- internal notes must stay hidden; enforced by column selection in the UI,
-- plus this policy is candidate-side SELECT of the row itself).
CREATE POLICY job_application_events_worker_select_own
  ON app_14da0f1941_job_application_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_14da0f1941_job_applications a
      WHERE a.id = application_id AND a.user_id = auth.uid()
    )
  );

-- Company reads events for applications to its jobs.
CREATE POLICY job_application_events_company_select_own_jobs
  ON app_14da0f1941_job_application_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_14da0f1941_job_applications a
      WHERE a.id = application_id AND a.company_user_id = auth.uid()
    )
  );

-- Admin / jobs_moderator read all events.
CREATE POLICY job_application_events_admin_select_all
  ON app_14da0f1941_job_application_events
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'gaspardelhierromata@gmail.com'
    OR EXISTS (
      SELECT 1 FROM app_14da0f1941_profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'jobs_moderator')
    )
  );

-- No direct INSERT/UPDATE/DELETE from clients: writes go through the
-- SECURITY DEFINER RPC below, which is the only writer.
GRANT SELECT ON app_14da0f1941_job_application_events TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Attribution + assignment columns on job_applications
-- ---------------------------------------------------------------------------

ALTER TABLE app_14da0f1941_job_applications
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text;

-- Bounded, sanitized values only (defense in depth; the UI also sanitizes).
ALTER TABLE app_14da0f1941_job_applications
  ADD CONSTRAINT job_applications_utm_source_len CHECK (utm_source IS NULL OR char_length(utm_source) <= 64),
  ADD CONSTRAINT job_applications_utm_medium_len CHECK (utm_medium IS NULL OR char_length(utm_medium) <= 64),
  ADD CONSTRAINT job_applications_utm_campaign_len CHECK (utm_campaign IS NULL OR char_length(utm_campaign) <= 128),
  ADD CONSTRAINT job_applications_utm_content_len CHECK (utm_content IS NULL OR char_length(utm_content) <= 128);

-- ---------------------------------------------------------------------------
-- 3. Transactional status update RPC
-- ---------------------------------------------------------------------------
-- Canonical statuses:
--   applied → reviewed → shortlisted → sent_to_client → interview → hired
--   terminal exits: rejected, withdrawn
-- Legacy 'cancelled' (PB-DRIFT-001 ghost rows) stays untouched/read-only.
--
-- Rules:
--   - Skips and corrections are allowed for authorized actors (with note),
--     because real processes don't always pass through interview.
--   - Reopening from a terminal state (hired/rejected/withdrawn) REQUIRES a
--     note and is audited as a normal event (history is never deleted).
--   - Idempotent: if the application is already in the target status, the RPC
--     returns success without inserting a duplicate event (double-click /
--     retry safe).
--   - 'sent_to_client' and 'withdrawn' are new statuses introduced here.

CREATE OR REPLACE FUNCTION app_update_application_status(
  p_application_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_app app_14da0f1941_job_applications%ROWTYPE;
  v_allowed text[] := ARRAY[
    'applied','reviewed','shortlisted','sent_to_client','interview',
    'hired','rejected','withdrawn'
  ];
  v_terminal text[] := ARRAY['hired','rejected','withdrawn'];
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT (p_new_status = ANY (v_allowed)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT role INTO v_role
  FROM app_14da0f1941_profiles
  WHERE user_id = v_actor;

  -- Lock the row to serialize concurrent transitions (double-click /
  -- simultaneous recruiters). Second transaction blocks, then sees the
  -- already-updated status and no-ops.
  SELECT * INTO v_app
  FROM app_14da0f1941_job_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Authorization: admin (role or primary admin email), jobs_moderator,
  -- or the company that owns the application. Workers can only withdraw
  -- their own application.
  IF NOT (
    v_role IN ('admin', 'jobs_moderator')
    OR (auth.jwt() ->> 'email') = 'gaspardelhierromata@gmail.com'
    OR v_app.company_user_id = v_actor
    OR (v_app.user_id = v_actor AND p_new_status = 'withdrawn')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Idempotency: already in target status → success, no duplicate event.
  IF v_app.status = p_new_status THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', p_new_status);
  END IF;

  -- Reopening from a terminal state requires an explicit reason.
  IF v_app.status = ANY (v_terminal) AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_required_for_reopen');
  END IF;

  UPDATE app_14da0f1941_job_applications
  SET status = p_new_status
  WHERE id = p_application_id;

  INSERT INTO app_14da0f1941_job_application_events
    (application_id, from_status, to_status, actor_user_id, actor_role, note)
  VALUES
    (p_application_id, v_app.status, p_new_status, v_actor, v_role, p_note);

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION app_update_application_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_update_application_status(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
