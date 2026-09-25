-- sql/014-daily-report-runs-service-role-grants.sql
-- PB-PDI-004 — FIX: la migración 012 revocó PUBLIC/anon/authenticated pero no
-- concedió privilegios a service_role, por lo que el claim idempotente de la
-- Edge Function fallaba con "permission denied" y el primer envío productivo
-- (tick 22:05 UTC = 00:05 Brussels) se saltó sin fila ni correo.
--
-- Grant mínimo para el runtime de la función: SELECT (dedupe), INSERT (claim),
-- UPDATE (finalize). Sin DELETE. anon/authenticated siguen sin acceso; RLS
-- permanece activada (service_role la bypassa por diseño de Supabase).

BEGIN;

GRANT SELECT, INSERT, UPDATE ON TABLE public.app_daily_intelligence_runs TO service_role;

COMMIT;
