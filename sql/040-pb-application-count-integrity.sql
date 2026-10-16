-- PB-APPLICATION-COUNT-INTEGRITY-001 — jobs.applications_count mantenido por trigger
--
-- ══════════════════════════════════════════════════════════════════════════════
-- Parte del lote PB-COMPANY-MVP-PHASE-0-001 (GO del PO 2026-10-16).
-- NO APLICADO TODAVÍA: requiere ventana de despliegue tras gates de QA.
-- ══════════════════════════════════════════════════════════════════════════════
--
-- EL PROBLEMA (verificación independiente 2026-10-16, solo lectura)
--
--   app_14da0f1941_jobs.applications_count es un contador desnormalizado que
--   NADA mantenía: el único escritor era CompanyPostJob.tsx insertando 0 al crear
--   la vacante. Estado real a fecha de corte:
--
--     job "2 Soldadores TIG + Electrodo — Suecia"  almacenado: 0 · real: 37
--     job "Mechanic / Electromechanical Mechanic"  almacenado: 0 · real:  3
--     job "5 Pipefitters – INEOS Project One"      almacenado: 0 · real:  5
--     job "2 Pipefitters – BASF EUROCHEM"          almacenado: 0 · real:  4
--
--   El 100% de las vacantes tiene el contador desincronizado. 49 candidaturas
--   reales invisibles para todo consumidor de la columna.
--
-- LA DECISIÓN
--
--   Trigger de base de datos, no escritura de frontend: las candidaturas nacen
--   de sesiones de TRABAJADOR (rol authenticated sin privilegios sobre jobs),
--   por lo que el único punto donde el contador puede mantenerse con garantías
--   es la base de datos, con función trigger SECURITY DEFINER.
--
--   SEMÁNTICA del contador: total de candidaturas recibidas para la vacante,
--   incluyendo las nacidas `pending_profile_validation` (no presentables aún)
--   y las `cancelled` históricas. Es el "applicants" que CompanyJobs muestra
--   por vacante y el K2 (applications per job) del frente Enterprise. Quien
--   necesite el desglose por estado lo deriva de job_applications; el contador
--   no pierde filas por diseño.
--
-- SEGURIDAD
--
--   - Una única función trigger, SECURITY DEFINER + `SET search_path = public`:
--     eleva a owner (postgres) solo para escribir UN entero en la fila de la
--     vacante afectada. jobs tiene RLS ENABLED pero NO FORCED, así que el owner
--     queda exento y no hace falta tocar políticas existentes.
--   - REVOKE EXECUTE FROM PUBLIC: la función solo puede dispararla el trigger
--     (los triggers corren con los privilegios del owner de la función), no
--     puede invocarse desde la Data API con argumentos arbitrarios.
--   - No toca RLS, no toca policies, no borra nada. Aditivo puro.
--
-- COMPATIBILIDAD
--
--   sql/034 (marketplace-ready activation) ya tiene triggers sobre
--   job_applications; este lote es aditivo y no interfiere: se ejecuta en la
--   misma transacción de INSERT/UPDATE sin tocar NEW/OLD.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 0 — PRECONDICIONES.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.app_14da0f1941_jobs') IS NULL THEN
    RAISE EXCEPTION 'PRECONDICION FALLIDA: falta app_14da0f1941_jobs.';
  END IF;

  IF to_regclass('public.app_14da0f1941_job_applications') IS NULL THEN
    RAISE EXCEPTION 'PRECONDICION FALLIDA: falta app_14da0f1941_job_applications.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_14da0f1941_jobs'
      AND column_name = 'applications_count'
  ) THEN
    RAISE EXCEPTION 'PRECONDICION FALLIDA: falta jobs.applications_count.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 — Función trigger. Sin argumentos: NEW/OLD se leen aquí, no se
-- serializan en el CREATE TRIGGER (los argumentos de trigger son solo
-- constantes; pasar expresiones como CASE no funciona en PostgreSQL).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_job_applications_count_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.app_14da0f1941_jobs
    SET applications_count = (
      SELECT count(*) FROM public.app_14da0f1941_job_applications a
      WHERE a.job_id = NEW.job_id
    )
    WHERE id = NEW.job_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.app_14da0f1941_jobs
    SET applications_count = (
      SELECT count(*) FROM public.app_14da0f1941_job_applications a
      WHERE a.job_id = OLD.job_id
    )
    WHERE id = OLD.job_id;

  ELSIF TG_OP = 'UPDATE' AND OLD.job_id IS DISTINCT FROM NEW.job_id THEN
    -- Reasignación de candidatura entre vacantes: sincronizar origen y destino.
    UPDATE public.app_14da0f1941_jobs
    SET applications_count = (
      SELECT count(*) FROM public.app_14da0f1941_job_applications a
      WHERE a.job_id = OLD.job_id
    )
    WHERE id = OLD.job_id;

    UPDATE public.app_14da0f1941_jobs
    SET applications_count = (
      SELECT count(*) FROM public.app_14da0f1941_job_applications a
      WHERE a.job_id = NEW.job_id
    )
    WHERE id = NEW.job_id;
  END IF;

  RETURN NULL; -- trigger AFTER: el valor de retorno se ignora.
END $$;

REVOKE ALL ON FUNCTION public.pb_job_applications_count_trg() FROM PUBLIC;

COMMENT ON FUNCTION public.pb_job_applications_count_trg() IS
  'Mantiene app_14da0f1941_jobs.applications_count = count(job_applications por job). SECURITY DEFINER: los INSERT de candidatura vienen de sesiones de trabajador sin privilegios sobre jobs. Ver PB-APPLICATION-COUNT-INTEGRITY-001.';

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 — Trigger sobre job_applications.
-- DROP IF EXISTS primero: la reejecucion del lote es idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS pb_jobs_applications_count_sync
  ON public.app_14da0f1941_job_applications;

CREATE TRIGGER pb_jobs_applications_count_sync
  AFTER INSERT OR DELETE OR UPDATE OF job_id
  ON public.app_14da0f1941_job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.pb_job_applications_count_trg();

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3 — BACKFILL. Repara el histórico descuadrado (49 candidaturas reales
-- hoy, 0 reflejadas). Idempotente: reejecutar recalcula lo mismo.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.app_14da0f1941_jobs j
SET applications_count = (
  SELECT count(*)
  FROM public.app_14da0f1941_job_applications a
  WHERE a.job_id = j.id
);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN. Ejecutar tras el COMMIT.
-- ─────────────────────────────────────────────────────────────────────────────

-- GATE de reconciliación. Debe devolver 0 filas: ninguna vacante descuadrada.
SELECT j.id, j.title, j.applications_count AS stored,
       (SELECT count(*) FROM public.app_14da0f1941_job_applications a WHERE a.job_id = j.id) AS real
FROM public.app_14da0f1941_jobs j
WHERE j.applications_count <> (
  SELECT count(*) FROM public.app_14da0f1941_job_applications a WHERE a.job_id = j.id
);

-- Sanity del estado tras backfill (informativo).
SELECT j.title, j.applications_count
FROM public.app_14da0f1941_jobs j
ORDER BY j.applications_count DESC;

-- GATE de trigger. Debe existir exactamente 1 (además de los internos y sql/034).
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.app_14da0f1941_job_applications'::regclass
  AND NOT tgisinternal
  AND tgname = 'pb_jobs_applications_count_sync';

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK — solo para emergencia. Retira trigger y función; el contador queda
-- congelado en su último valor verdadero. NO se reintroduce el 0 estructural.
-- ─────────────────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP TRIGGER IF EXISTS pb_jobs_applications_count_sync
--     ON public.app_14da0f1941_job_applications;
--   DROP FUNCTION IF EXISTS public.pb_job_applications_count_trg();
-- COMMIT;
