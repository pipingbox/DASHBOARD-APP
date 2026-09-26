-- ══════════════════════════════════════════════════════════════════════════════
-- sql/012 — PROPUESTA (NO APLICADA) — F-1: owner DELETE en app_worker_experiences
--
-- ESTADO: PROPUESTA PENDIENTE DE AUTORIZACIÓN PO + ACCESO PRIVILEGIADO (A5).
-- Detectado por tests/rls-worker-experiences.spec.ts en el run CI 36222667243
-- (2026-09-26): el control positivo "owner can DELETE their own row" devolvió
-- error HTTP (no-ok) con el JWT del propietario, mientras INSERT/SELECT/UPDATE
-- del propietario funcionan. La UI (WorkExperienceSection) elimina
-- optimistamente ANTES de await, por lo que hoy presenta un FALSO ÉXITO de
-- borrado: la fila desaparece de pantalla pero persiste en la base compartida.
--
-- IMPACTO:
--   - Producto: el usuario no puede borrar su experiencia real (WFA-001).
--   - Pruebas: ninguna suite puede limpiar sus fixtures → contaminación de la
--     cuenta QA y falsos diffs en columnas derivadas (profile_completion,
--     onboarding_status) en specs posteriores (observado en el mismo run).
--   - B3: permanece HOLD hasta que este contrato exista y se verifique.
--
-- CAUSA PROBABLE (verificar en el proyecto antes de aplicar):
--   falta el GRANT DELETE a authenticated y/o la policy RLS FOR DELETE.
--   Las policies de esta tabla no están versionadas en el repo (governance gap
--   conocido sql/ vs supabase/migrations) — CONFIRMAR el estado real con:
--
--     SELECT pol.polname, pol.polcmd
--       FROM pg_policy pol
--       JOIN pg_class rel ON rel.oid = pol.polrelid
--      WHERE rel.relname = 'app_worker_experiences';
--
--     SELECT grantee, privilege_type
--       FROM information_schema.role_table_grants
--      WHERE table_name = 'app_worker_experiences';
--
-- APLICACIÓN: solo tras GO del PO, por el canal privilegiado documentado en
-- brain/03-ENGINEERING/RUNBOOK-A5-SECURITY-P0.md, con verificación
-- antes/después (tests/rls-worker-experiences.spec.ts debe pasar 8/8 una vez
-- configurada la segunda identidad QA).
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Privilegio de tabla para el rol autenticado (propietario vía JWT).
GRANT DELETE ON public.app_worker_experiences TO authenticated;

-- 2. Policy RLS: el propietario solo puede borrar SUS propias filas.
--    (Solo si no existe ya una policy FOR DELETE equivalente — verificar con
--    la consulta de arriba; pg no admite IF NOT EXISTS en CREATE POLICY, por
--    eso el DO block.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policy pol
      JOIN pg_class rel ON rel.oid = pol.polrelid
     WHERE rel.relname = 'app_worker_experiences'
       AND pol.polcmd = 'd'           -- DELETE
       AND pol.polname = 'worker_experiences_owner_delete'
  ) THEN
    CREATE POLICY worker_experiences_owner_delete
      ON public.app_worker_experiences
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- VERIFICACIÓN POST-APLICACIÓN (con cuenta QA, sin service_role):
--   tests/rls-worker-experiences.spec.ts › "POSITIVE CONTROL: owner can DELETE
--   their own row" debe pasar, y los intentos cruzados (QA B) deben seguir
--   denegados.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS worker_experiences_owner_delete ON public.app_worker_experiences;
--   REVOKE DELETE ON public.app_worker_experiences FROM authenticated;
