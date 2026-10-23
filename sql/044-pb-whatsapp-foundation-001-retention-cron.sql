-- ============================================================================
-- PB-WHATSAPP-FOUNDATION-001 — FIX1 (L4) — JOB PERIODICO DE RETENCION (pg_cron)
-- ============================================================================
-- Programa la purga diaria de retencion definida en 043
-- (public.pb_phone_purge_retention). Sin job activo, la retencion configurable
-- no se ejecuta: una RPC probada manualmente no acredita ejecucion periodica.
--
-- Programacion: diaria 03:17 UTC (fuera de hora punta; minuto desplazado para
-- evitar la congestion tipica del minuto 0). Idempotente: reprograma si ya
-- existe. El job corre como el rol que lo programa (postgres en hosted
-- Supabase, superusuario), por lo que puede ejecutar la funcion SECURITY
-- INVOKER aunque EXECUTE este revocado de PUBLIC/anon/authenticated.
--
-- Que purga (ver 043): phone_verifications (30d por defecto) y
-- phone_provider_outbox (7d por defecto), configurable via
-- app_14da0f1941_phone_ops_config. NUNCA phone_events ni consentimiento.
--
-- Aplicar en QA y, tras el GO de produccion, en produccion.
-- Rollback: SELECT cron.unschedule('pb-phone-purge-retention');
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pb-phone-purge-retention') THEN
    PERFORM cron.unschedule('pb-phone-purge-retention');
  END IF;

  PERFORM cron.schedule(
    'pb-phone-purge-retention',
    '17 3 * * *',
    $cmd$SELECT public.pb_phone_purge_retention();$cmd$
  );
END $$;

-- Verificacion post-aplicacion (informativa):
-- SELECT jobid, jobname, schedule, command, active FROM cron.job WHERE jobname = 'pb-phone-purge-retention';
