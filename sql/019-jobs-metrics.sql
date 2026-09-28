-- PB-JOBS-ATS-001 §9: reusable operational metrics per job and acquisition
-- channel. Read-only. Distinguishes unique people from applications (a person
-- applying twice to the same job counts once as a candidate).
--
-- Usage:
--   SELECT * FROM app_14da0f1941_job_metrics_by_job;
--   SELECT * FROM app_14da0f1941_job_metrics_by_channel;
--
-- Vacancies filled vs requested uses current 'hired' count (a reopened and
-- re-hired application still counts once because the events table records
-- transitions but the metric reads the application's current status).

CREATE OR REPLACE VIEW app_14da0f1941_job_metrics_by_job AS
SELECT
  j.id AS job_id,
  j.title AS job_title,
  j.vacancies,
  count(a.id) AS applications_received,
  count(DISTINCT a.user_id) AS unique_candidates,
  count(a.id) FILTER (WHERE a.status IN ('reviewed','shortlisted','sent_to_client','interview','hired')) AS reviewed,
  count(a.id) FILTER (WHERE a.status IN ('shortlisted','sent_to_client','interview','hired')) AS shortlisted,
  count(a.id) FILTER (WHERE a.status IN ('sent_to_client','interview','hired')) AS sent_to_client,
  count(a.id) FILTER (WHERE a.status = 'interview' OR (a.status = 'hired' AND EXISTS (
    SELECT 1 FROM app_14da0f1941_job_application_events e
    WHERE e.application_id = a.id AND e.to_status = 'interview'
  ))) AS interviewed,
  count(a.id) FILTER (WHERE a.status = 'hired') AS hired,
  count(a.id) FILTER (WHERE a.status = 'rejected') AS rejected,
  count(a.id) FILTER (WHERE a.status = 'withdrawn') AS withdrawn,
  CASE WHEN j.vacancies > 0
    THEN round(count(a.id) FILTER (WHERE a.status = 'hired')::numeric / j.vacancies, 3)
    ELSE NULL
  END AS fill_rate
FROM app_14da0f1941_jobs j
LEFT JOIN app_14da0f1941_job_applications a ON a.job_id = j.id
GROUP BY j.id, j.title, j.vacancies;

CREATE OR REPLACE VIEW app_14da0f1941_job_metrics_by_channel AS
SELECT
  a.job_id,
  coalesce(a.utm_source, 'unknown') AS source,
  coalesce(a.utm_medium, 'unknown') AS medium,
  coalesce(a.utm_campaign, 'unknown') AS campaign,
  count(a.id) AS applications_received,
  count(DISTINCT a.user_id) AS unique_candidates,
  count(a.id) FILTER (WHERE a.status = 'hired') AS hired
FROM app_14da0f1941_job_applications a
GROUP BY a.job_id, a.utm_source, a.utm_medium, a.utm_campaign;

GRANT SELECT ON app_14da0f1941_job_metrics_by_job TO authenticated;
GRANT SELECT ON app_14da0f1941_job_metrics_by_channel TO authenticated;
