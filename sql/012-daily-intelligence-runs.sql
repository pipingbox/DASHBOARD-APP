-- sql/012-daily-intelligence-runs.sql
-- PB-PDI-004 — PipingBox Daily Intelligence: registro canónico de ejecuciones
-- del informe diario (idempotencia anti-duplicado + estados + auditoría).
--
-- JUSTIFICACIÓN DEL DDL NUEVO
--   No existe tabla canónica de ejecuciones/informes (verificado: solo
--   beta_feedback_reports, no relacionado). El informe diario exige:
--     - impedir dos envíos del mismo día natural (idempotencia);
--     - registrar estados PENDING/GENERATING/SENT/PARTIAL/FAILED;
--     - número de intentos, timestamp de envío, error sanitizado, correlation id.
--   Nada de esto existe hoy, por lo que se crea una tabla dedicada. No se
--   reutiliza una tabla ajena para no acoplar dominios.
--
-- SEGURIDAD
--   - Solo el service_role (Edge Function) escribe/lee esta tabla.
--   - RLS habilitado; sin grants a anon/authenticated: la función usa
--     service_role (bypass RLS) y nadie más debe tocarla.
--   - No almacena PII ni secretos: error_sanitized es un mensaje ya limpio.
--
-- NO APLICAR A PRODUCCIÓN sin el gate correspondiente del PO.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_daily_intelligence_runs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Día natural analizado en Europe/Brussels (YYYY-MM-DD). Es la clave de
  -- idempotencia: un único informe por día.
  report_date       DATE        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','GENERATING','SENT','PARTIAL','FAILED')),
  attempts          INTEGER     NOT NULL DEFAULT 0,
  correlation_id    TEXT        NOT NULL,
  -- Qué fuentes estaban disponibles en la última ejecución (auditoría; el
  -- informe nunca se marca completo si una fuente cayó).
  posthog_ok        BOOLEAN     NOT NULL DEFAULT false,
  supabase_ok       BOOLEAN     NOT NULL DEFAULT false,
  stripe_ok         BOOLEAN     NOT NULL DEFAULT false,
  email_ok          BOOLEAN     NOT NULL DEFAULT false,
  -- Mensaje de error ya sanitizado (sin secretos ni PII). Nunca el error crudo.
  error_sanitized   TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotencia anti-duplicado: un único informe por día Brussels.
  CONSTRAINT app_daily_intelligence_runs_report_date_key UNIQUE (report_date)
);

-- El claim atómico (insert-on-conflict / SELECT ... FOR UPDATE) vive en la
-- Edge Function; la restricción UNIQUE es la garantía de base de datos.

ALTER TABLE public.app_daily_intelligence_runs ENABLE ROW LEVEL SECURITY;

-- Sin políticas para anon/authenticated: nadie salvo service_role accede.
-- (service_role bypasea RLS por diseño de Supabase.)

REVOKE ALL ON public.app_daily_intelligence_runs FROM PUBLIC;
REVOKE ALL ON public.app_daily_intelligence_runs FROM anon;
REVOKE ALL ON public.app_daily_intelligence_runs FROM authenticated;
-- service_role mantiene acceso (bypass RLS); no se otorgan grants adicionales.

CREATE INDEX IF NOT EXISTS idx_app_daily_intelligence_runs_status
  ON public.app_daily_intelligence_runs (status);

COMMENT ON TABLE public.app_daily_intelligence_runs IS
  'PB-PDI-004: una fila por día natural Europe/Brussels. Idempotencia por UNIQUE(report_date). Estados del ciclo de vida del informe diario. Solo service_role.';
COMMENT ON COLUMN public.app_daily_intelligence_runs.report_date IS
  'Día natural analizado en Europe/Brussels (clave de idempotencia).';
COMMENT ON COLUMN public.app_daily_intelligence_runs.error_sanitized IS
  'Mensaje de error ya sanitizado; nunca secretos, PII ni trazas crudas.';

COMMIT;
