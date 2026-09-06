-- PB-STORAGE-SECURITY-001
-- Reproduce production migration: pb_storage_security_001_service_role_relationship_select
-- Supabase migration version applied in production: 20260906193944
--
-- Root cause:
-- secure-file-access uses a service_role client for backend authorization checks.
-- service_role bypasses RLS, but it still requires SQL table privileges. SELECT
-- was missing on three relationship tables, so PostgREST returned permission
-- errors. isCompanyAuthorized() ignored those errors and collapsed them to false,
-- producing a misleading 403 "Company not authorized to access this candidate".
--
-- Scope is intentionally minimal: read-only access for service_role only.
-- RLS and authenticated grants are unchanged.

BEGIN;

GRANT SELECT ON TABLE public.app_14da0f1941_job_applications TO service_role;
GRANT SELECT ON TABLE public.app_14da0f1941_jobs TO service_role;
GRANT SELECT ON TABLE public.app_14da0f1941_workforce_requests TO service_role;

COMMIT;

-- Verification:
-- SELECT
--   has_table_privilege('service_role', 'public.app_14da0f1941_job_applications', 'SELECT') AS job_applications_select,
--   has_table_privilege('service_role', 'public.app_14da0f1941_jobs', 'SELECT') AS jobs_select,
--   has_table_privilege('service_role', 'public.app_14da0f1941_workforce_requests', 'SELECT') AS workforce_requests_select;
-- Expected: true / true / true.
