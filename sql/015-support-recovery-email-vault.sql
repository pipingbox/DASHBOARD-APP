-- sql/015-support-recovery-email-vault.sql
-- PB-PDI-004 — autenticación de support-recovery-email vía Supabase Vault
-- (espejo del patrón probado de sql/013-daily-report-cron-vault.sql).
--
-- DISEÑO DE SEGURIDAD
--   - El valor de la invoke key NUNCA aparece en SQL, código, logs ni chat:
--     se genera DENTRO de la base de datos (gen_random_bytes) y solo viaja
--     DB → Edge Function en la cabecera X-Recovery-Key en tiempo de ejecución.
--   - No se escribe service_role ni ninguna clave como literal SQL.
--   - El verificador `app_verify_recovery_invoke_key` es SECURITY DEFINER
--     mínimo: expone únicamente un booleano (comparación contra Vault),
--     search_path fijado a pg_catalog, sin EXECUTE para PUBLIC/anon/
--     authenticated y concedido solo a service_role. No otorga acceso a
--     ningún otro secreto de Vault.
--   - Sin cron: la invocación es PUNTUAL (una única prueba TEST autorizada
--     por el PO; el envío real exige un segundo GO).
--
-- INVOCACIÓN (ejecutar aparte, nunca queda programada):
--   SELECT net.http_post(
--     url := 'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/support-recovery-email',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'X-Recovery-Key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'support-recovery-invoke-key')
--     ),
--     body := jsonb_build_object('mode', 'TEST'),
--     timeout_milliseconds := 60000
--   );

BEGIN;

-- 1) Invoke key en Vault (idempotente: solo si no existe).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'support-recovery-invoke-key') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'support-recovery-invoke-key',
      'PB-PDI-004: clave de invocación de support-recovery-email (cabecera X-Recovery-Key)'
    );
  END IF;
END
$$;

-- 2) Verificador SECURITY DEFINER mínimo (solo service_role).
CREATE OR REPLACE FUNCTION public.app_verify_recovery_invoke_key(p_candidate text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT p_candidate IS NOT NULL AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'support-recovery-invoke-key'
      AND decrypted_secret = p_candidate
  )
$fn$;

REVOKE ALL ON FUNCTION public.app_verify_recovery_invoke_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_verify_recovery_invoke_key(text) TO service_role;

COMMIT;
