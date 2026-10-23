-- =============================================================================
-- ####  T E S T   F I X T U R E  —  N O T   P R O D U C T I O N   S Q L  ####
-- =============================================================================
--
--   ######################################################################
--   #   DO NOT RUN THIS FILE AGAINST SUPABASE, STAGING OR PRODUCTION.    #
--   ######################################################################
--
-- PURPOSE:
-- Stubs adicionales que sql/058-pb-ce-company-core-001.sql necesita y que
-- TESTFIXTURE-000-stubs.sql no cubre (ese fixture se creó para 004/005):
--   · app_14da0f1941_audit_logs  — destino del audit log reutilizado por 058.
--   · auth.jwt()                 — la función pb_company_audit lee el email.
--   · current_setting('request.jwt.claims') helper no requerido: el stub de
--     auth.jwt() devuelve un JSON fijo controlado por el harness.
--
-- DELIBERATELY MINIMAL: solo las columnas que 058 toca. Ver README.
-- =============================================================================

-- auth.jwt() — en Supabase devuelve los claims del JWT. El harness de
-- concurrencia no necesita emails reales; basta un JSON estable.
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object('email', 'e0a-harness@example.invalid');
$$;

GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;

-- El stub 000 de app_14da0f1941_profiles solo declara (id, user_id, role);
-- 058 lee además: full_name (pb_company_members) y company, company_country,
-- company_verified, account_type (migración de compatibilidad legacy, sección
-- final). Se añaden aquí, no en 000, para no tocar el fixture de otro ticket.
ALTER TABLE public.app_14da0f1941_profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.app_14da0f1941_profiles ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.app_14da0f1941_profiles ADD COLUMN IF NOT EXISTS company_country text;
ALTER TABLE public.app_14da0f1941_profiles ADD COLUMN IF NOT EXISTS company_verified boolean;
ALTER TABLE public.app_14da0f1941_profiles ADD COLUMN IF NOT EXISTS account_type text;

-- app_14da0f1941_audit_logs — stub mínimo: 058 inserta
-- (actor_email, action_type, target_type, target_id, details).
CREATE TABLE IF NOT EXISTS public.app_14da0f1941_audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_email text,
  action_type text,
  target_type text,
  target_id   text,
  details     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
