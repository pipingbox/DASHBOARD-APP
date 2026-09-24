ALTER TABLE public.beta_feedback_reports
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS visible_text text,
  ADD COLUMN IF NOT EXISTS suggested_text text,
  ADD COLUMN IF NOT EXISTS i18n_key text,
  ADD COLUMN IF NOT EXISTS i18n_candidates text[],
  ADD COLUMN IF NOT EXISTS canonical_text text,
  ADD COLUMN IF NOT EXISTS build_sha text,
  ADD COLUMN IF NOT EXISTS reporter_type text;

CREATE TABLE IF NOT EXISTS public.beta_feedback_rate_limits (
  subject_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL
);
ALTER TABLE public.beta_feedback_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_feedback_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_controlled_feedback(
  p_subject text, p_limit integer, p_category text, p_description text,
  p_locale text, p_route text, p_visible_text text, p_suggested_text text,
  p_i18n_key text, p_i18n_candidates text[], p_canonical_text text,
  p_build_sha text, p_user_id text, p_screenshot_url text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_attempts integer;
  v_id uuid;
BEGIN
  IF p_subject !~ '^[a-f0-9]{64}$' OR p_limit NOT IN (5, 20) THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_subject, 0));
  INSERT INTO public.beta_feedback_rate_limits (subject_hash, window_start, attempts)
  VALUES (p_subject, now(), 1)
  ON CONFLICT (subject_hash) DO UPDATE SET
    window_start = CASE WHEN beta_feedback_rate_limits.window_start < now() - interval '1 hour'
      THEN now() ELSE beta_feedback_rate_limits.window_start END,
    attempts = CASE WHEN beta_feedback_rate_limits.window_start < now() - interval '1 hour'
      THEN 1 ELSE beta_feedback_rate_limits.attempts + 1 END
  RETURNING attempts INTO v_attempts;
  IF v_attempts > p_limit THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.beta_feedback_reports (
    category, description, locale, route, page_url, visible_text, suggested_text,
    i18n_key, i18n_candidates, canonical_text, build_sha, reporter_type,
    user_id, screenshot_url
  ) VALUES (
    p_category, p_description, p_locale, p_route, p_route, p_visible_text, p_suggested_text,
    p_i18n_key, p_i18n_candidates, p_canonical_text, p_build_sha,
    CASE WHEN p_user_id IS NULL THEN 'anonymous' ELSE 'authenticated' END,
    p_user_id, p_screenshot_url
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_controlled_feedback(text, integer, text, text, text, text, text, text, text, text[], text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_controlled_feedback(text, integer, text, text, text, text, text, text, text, text[], text, text, text, text) TO service_role;
