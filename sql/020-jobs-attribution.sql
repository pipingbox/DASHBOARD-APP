-- PB-JOBS-ATTRIBUTION-001: first-touch attribution columns + utm_term.
--
-- Additive-only. The existing utm_* columns (sql/018) store the LAST
-- attributed entry per job; these columns add the visitor's FIRST campaign
-- touch (never overwritten) and utm_term.
--
-- Rollback:
--   ALTER TABLE app_14da0f1941_job_applications
--     DROP COLUMN IF EXISTS first_touch_source,
--     DROP COLUMN IF EXISTS first_touch_medium,
--     DROP COLUMN IF EXISTS first_touch_campaign,
--     DROP COLUMN IF EXISTS first_touch_content,
--     DROP COLUMN IF EXISTS utm_term;

ALTER TABLE app_14da0f1941_job_applications
  ADD COLUMN IF NOT EXISTS first_touch_source text,
  ADD COLUMN IF NOT EXISTS first_touch_medium text,
  ADD COLUMN IF NOT EXISTS first_touch_campaign text,
  ADD COLUMN IF NOT EXISTS first_touch_content text,
  ADD COLUMN IF NOT EXISTS utm_term text;

ALTER TABLE app_14da0f1941_job_applications
  ADD CONSTRAINT job_applications_first_touch_source_len CHECK (first_touch_source IS NULL OR char_length(first_touch_source) <= 64),
  ADD CONSTRAINT job_applications_first_touch_medium_len CHECK (first_touch_medium IS NULL OR char_length(first_touch_medium) <= 64),
  ADD CONSTRAINT job_applications_first_touch_campaign_len CHECK (first_touch_campaign IS NULL OR char_length(first_touch_campaign) <= 128),
  ADD CONSTRAINT job_applications_first_touch_content_len CHECK (first_touch_content IS NULL OR char_length(first_touch_content) <= 128),
  ADD CONSTRAINT job_applications_utm_term_len CHECK (utm_term IS NULL OR char_length(utm_term) <= 128);

NOTIFY pgrst, 'reload schema';
