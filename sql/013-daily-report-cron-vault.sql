-- sql/013-daily-report-cron-vault.sql
-- PB-PDI-004 — autenticación del cron vía Supabase Vault + job pg_cron
-- idempotente (tick horario `5 * * * *`; la función solo envía el informe
-- productivo cuando la hora local Europe/Brussels es 00:05, CET/CEST).
--
-- DISEÑO DE SEGURIDAD
--   - El valor de la cron key NUNCA aparece en SQL, código, logs ni chat: se
--     genera DENTRO de la base de datos (gen_random_bytes) y solo viaja
--     DB → Edge Function en la cabecera X-Cron-Key en tiempo de ejecución.
--   - El verificador `app_verify_daily_report_cron_key` es SECURITY DEFINER
--     mínimo: expone únicamente un booleano (comparación contra Vault),
--     search_path fijado a pg_catalog, sin EXECUTE para PUBLIC/anon/
--     authenticated y concedido solo a service_role. No otorga acceso a
--     ningún otro secreto de Vault.
--   - El envío productivo queda además bloqueado por el secreto de Edge
--     Function DAILY_REPORT_ENABLED="true" (lo activa el PO tras aprobar el
--     correo de prueba). Hasta entonces cada tick horario se salta sin claim
--     ni correo.

BEGIN;

-- 1) Cron key en Vault (idempotente: solo si no existe).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'daily-intelligence-cron-key') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'daily-intelligence-cron-key',
      'PB-PDI-004: clave del cron daily-intelligence-report (cabecera X-Cron-Key)'
    );
  END IF;
END
$$;

-- 2) Verificador SECURITY DEFINER mínimo (solo service_role).
CREATE OR REPLACE FUNCTION public.app_verify_daily_report_cron_key(p_candidate text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT p_candidate IS NOT NULL AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'daily-intelligence-cron-key'
      AND decrypted_secret = p_candidate
  )
$fn$;

REVOKE ALL ON FUNCTION public.app_verify_daily_report_cron_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_verify_daily_report_cron_key(text) TO service_role;

-- 3) Job pg_cron idempotente. `5 * * * *` es UTC y Brussels comparte offsets
--    en horas exactas (CET+1/CEST+2), así que el tick :05 coincide en ambas;
--    la función decide en runtime (Intl) que solo la hora Brussels 00:05 envía.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-intelligence-report') THEN
    PERFORM cron.unschedule('daily-intelligence-report');
  END IF;

  PERFORM cron.schedule(
    'daily-intelligence-report',
    '5 * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/daily-intelligence-report',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'daily-intelligence-cron-key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 180000
      )
    $cron$
  );
END
$$;

COMMIT;
