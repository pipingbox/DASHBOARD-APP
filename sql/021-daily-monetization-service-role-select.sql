-- sql/021-daily-monetization-service-role-select.sql
-- PB-DAILY-MONETIZATION-PERMISSIONS-001 — FIX: las tablas canónicas de
-- monetización se crearon con grants deliberadamente mínimos
-- (app_marketplace_revenue_events: SELECT solo a authenticated en
-- sql/005-revenue-events.sql; app_orders/app_subscriptions: sin SELECT para
-- ningún rol API — sql/003-stripe-payments-schema.sql), y nadie concedió
-- SELECT a service_role. La Edge Function daily-intelligence-report las lee
-- server-side con service_role y producción registró HTTP 403 / SQLSTATE
-- 42501 ("permission denied for table app_marketplace_revenue_events" y
-- "app_orders") en el Daily del 2026-10-06.
--
-- Grant mínimo: SOLO SELECT a service_role, exactamente sobre las tablas que
-- el Daily necesita leer. app_subscriptions se incluye porque el bloque
-- Stripe del Daily la consulta (plan activado tras checkout) y tiene el mismo
-- déficit: el 403 reaparecería el primer día con una orden pagada.
--
-- No se toca anon ni authenticated (sin nuevos privilegios), no se desactiva
-- RLS (service_role la bypassa por diseño de Supabase), sin SECURITY DEFINER,
-- sin ALL PRIVILEGES, sin grants a nivel de schema.

BEGIN;

GRANT SELECT ON TABLE public.app_marketplace_revenue_events TO service_role;
GRANT SELECT ON TABLE public.app_orders TO service_role;
GRANT SELECT ON TABLE public.app_subscriptions TO service_role;

COMMIT;

-- Verificación manual (read-only):
--   SELECT has_table_privilege('service_role','public.app_marketplace_revenue_events','SELECT'),
--          has_table_privilege('service_role','public.app_orders','SELECT'),
--          has_table_privilege('service_role','public.app_subscriptions','SELECT');
-- Debe devolver true/true/true. anon y authenticated conservan exactamente
-- sus privilegios previos (sin cambios).
