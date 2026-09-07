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
--
-- This file mirrors the production migration, including its audit record. It is
-- repository evidence/reproduction of an already-applied production migration;
-- do not re-apply it manually to production outside the governed migration flow.

BEGIN;

GRANT SELECT ON TABLE public.app_14da0f1941_job_applications TO service_role;
GRANT SELECT ON TABLE public.app_14da0f1941_jobs TO service_role;
GRANT SELECT ON TABLE public.app_14da0f1941_workforce_requests TO service_role;

INSERT INTO public.app_14da0f1941_audit_logs (
    actor_email,
    action_type,
    target_type,
    target_id,
    details
)
VALUES (
    'system@pipingbox.migration',
    'SERVICE_ROLE_RELATIONSHIP_SELECT_RESTORED',
    'system',
    'pb_storage_security_001_service_role_relationship_select',
    jsonb_build_object(
        'ticket', 'PB-STORAGE-SECURITY-001',
        'reason', 'secure-file-access relationship resolver requires read-only access; missing SELECT was silently converted to company unauthorized',
        'granted_to', 'service_role',
        'privilege', 'SELECT',
        'tables', jsonb_build_array(
            'app_14da0f1941_job_applications',
            'app_14da0f1941_jobs',
            'app_14da0f1941_workforce_requests'
        ),
        'rls_unchanged', true,
        'authenticated_grants_unchanged', true,
        'applied_at', now()
    )::text
);

COMMIT;

-- Verification:
-- SELECT
--   has_table_privilege('service_role', 'public.app_14da0f1941_job_applications', 'SELECT') AS job_applications_select,
--   has_table_privilege('service_role', 'public.app_14da0f1941_jobs', 'SELECT') AS jobs_select,
--   has_table_privilege('service_role', 'public.app_14da0f1941_workforce_requests', 'SELECT') AS workforce_requests_select;
-- Expected: true / true / true.
