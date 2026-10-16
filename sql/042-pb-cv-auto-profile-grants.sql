-- ══════════════════════════════════════════════════════════════════════════════
-- PB-CV-AUTO-PROFILE-001 (supplement) — service_role INSERT on experiences
--
-- QA sobre el proyecto real reveló que service_role carece de INSERT en
-- app_worker_experiences (tabla preexistente: hasta ahora solo la escribía
-- el usuario vía RLS owner-policy). cv-apply-draft es el primer writer
-- service_role de experiencias → PostgREST 403 → experience_insert_failed.
--
-- Patrón sql/039: grants explícitos, sin confiar en default privileges.
-- Rollback: REVOKE INSERT ON public.app_worker_experiences FROM service_role;
-- ══════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT ON public.app_worker_experiences TO service_role;

-- Verificación: has_table_privilege('service_role','app_worker_experiences','INSERT')
-- debe devolver true.
