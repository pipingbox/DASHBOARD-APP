BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'welcome-email-cron-key') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'welcome-email-cron-key', 'PB-WELCOME-EMAIL-001 cron authentication');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.app_14da0f1941_verify_welcome_cron_key(p_candidate text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT p_candidate IS NOT NULL AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'welcome-email-cron-key' AND decrypted_secret = p_candidate
  )
$fn$;

REVOKE ALL ON FUNCTION public.app_14da0f1941_verify_welcome_cron_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_14da0f1941_verify_welcome_cron_key(text) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pb-welcome-email') THEN
    PERFORM cron.unschedule('pb-welcome-email');
  END IF;
  PERFORM cron.schedule(
    'pb-welcome-email',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/welcome-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'welcome-email-cron-key')
        ),
        body := '{"drain":"all"}'::jsonb,
        timeout_milliseconds := 180000
      )
    $cron$
  );
END $$;

COMMIT;
