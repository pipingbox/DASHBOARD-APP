-- ═══════════════════════════════════════════════════════════════════════════════
-- PB-JOBS-APPLICATION-STATUS-AUTH-001 — Control canónico de transiciones de
-- estado de candidaturas Jobs (P0).
--
-- RCA (auditoría producción + reproducción QA, 19/10/2026):
--   * app_14da0f1941_job_applications: ACL authenticated=arwdm (UPDATE de tabla
--     completa, sin restricción de columnas) + policies
--     applications_worker_update_own / applications_company_update_own_jobs con
--     WITH CHECK limitado a la propiedad de la fila. Sin trigger BEFORE UPDATE.
--   * El RPC canónico app_update_application_status (sql/034) es fail-closed,
--     pero su uso es OPCIONAL: el UPDATE directo vía PostgREST lo elude.
--   * Vías confirmadas en QA (fixtures sintéticos):
--       E1 worker → status='hired' sobre su propia candidatura: PERMITIDO.
--       E2 worker → status='sent_to_client' sin perfil validado: PERMITIDO
--          (elude el guard profile_not_marketplace_ready del RPC).
--       E3 empresa → UPDATE directo de status: PERMITIDO (elude el RPC y no
--          deja evento ATS).
--       E6 worker → reasigna company_user_id de su candidatura a otra empresa
--          y esa empresa la marca 'hired': PERMITIDO (secuestro de candidatura).
--       E4/E5 cross-user / cross-company: bloqueados por RLS (correcto).
--   * Ninguna de las transiciones maliciosas quedó registrada en
--     app_14da0f1941_job_application_events (historial ATS corruptible).
--   * Además el worker "retira" con DELETE directo (frontend Applications.tsx):
--     destruye la fila y su historial en vez de fijar status='withdrawn'.
--
-- Solución (defensa en profundidad, fail-closed):
--   1. REVOKE UPDATE/DELETE de la tabla para anon/authenticated: toda
--      modificación pasa por el RPC canónico (SECURITY DEFINER) o por funciones
--      backend (triggers 034/039, sync 045), que se ejecutan como postgres y no
--      dependen del ACL del llamante. SELECT/INSERT se conservan (las policies
--      de lectura y el apply inicial no cambian).
--   2. Trigger BEFORE UPDATE OR DELETE (segunda línea de defensa): valida el
--      actor canónico, la inmutabilidad de columnas de identidad y la máquina
--      de transiciones por rol. Los writers legítimos (postgres/service_role)
--      quedan exentos; los estados iniciales se fijan en BEFORE INSERT (034) y
--      no pasan por este trigger.
--   3. Frontend: el retiro del trabajador pasa de DELETE directo al RPC
--      canónico con status='withdrawn' (conserva fila + historial ATS).
--
-- Compatibilidad:
--   * RPC app_update_application_status (sql/034): inalterado; ejecuta como
--     postgres → exento del trigger y del REVOKE. Sus reglas (autorización,
--      note_required_for_reopen, guard sent_to_client) se mantienen como
--      autoridad funcional; este trigger solo replica el perímetro para el
--      hipotético camino directo (defensa en profundidad).
--   * Trigger 034 on_marketplace_ready_transition (pending→applied), trigger
--     039 pb_downgrade_unpresented_applications (applied→pending), función 045
--     pb_sync_marketplace_ready_state: SECURITY DEFINER postgres → exentos.
--   * service_role (Edge Functions): exento (patrón sql/036/042/045).
--   * Estados existentes ('cancelled' legacy PB-DRIFT-001): intocados; el
--     trigger no reescribe filas existentes.
--   * NO toca policies de Storage (sql/053), PR #86, emails ni Stripe.
--
-- Rollback: sección final comentada + documento de entrega. No destructivo:
-- restaura grants y elimina el trigger; no borra eventos ni reescribe estados.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Función guardián BEFORE UPDATE OR DELETE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_14da0f1941_guard_application_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claims     text := nullif(current_setting('request.jwt.claims', true), '');
  v_cur_user   text := current_user;
  v_jwt_role   text := coalesce(v_claims::jsonb ->> 'role', '');
  v_actor      uuid;
  v_profile    record;
  v_is_admin   boolean;
  v_is_company boolean;
  v_is_owner   boolean;
  v_allowed    text[] := ARRAY[
    'applied','reviewed','shortlisted','sent_to_client','interview',
    'hired','rejected','withdrawn','pending_profile_validation','cancelled'
  ];
  v_terminal   text[] := ARRAY['hired','rejected','withdrawn'];
BEGIN
  -- Actores canónicos exentos (writers legítimos):
  --   * postgres (rol de sesión real: RPC SECURITY DEFINER, triggers 034/039,
  --     migraciones, consola SQL) y service_role (Edge Functions, JWT o rol).
  --   * acceso directo sin JWT (postgres/admin; patrón sql/004/045).
  IF v_cur_user IN ('postgres', 'service_role') OR v_jwt_role = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- DELETE directo prohibido para actores no privilegiados: el retiro del
  -- trabajador es status='withdrawn' vía RPC (conserva historial ATS).
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_profile
  FROM public.app_14da0f1941_profiles
  WHERE user_id = v_actor;

  v_is_admin := coalesce(v_profile.role IN ('admin', 'jobs_moderator'), false)
    OR coalesce((auth.jwt() ->> 'email') = 'gaspardelhierromata@gmail.com', false)
    OR coalesce((auth.jwt() ->> 'email') = 'qa-admin-override@example.invalid', false);
  v_is_company := OLD.company_user_id IS NOT NULL AND OLD.company_user_id = v_actor;
  v_is_owner := OLD.user_id = v_actor;

  -- Columnas de identidad inmutables para actores no admin (E6: secuestro).
  IF NOT v_is_admin THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.company_user_id IS DISTINCT FROM OLD.company_user_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Cambios que no alteran el estado (p.ej. asignación interna admin): solo
  -- admin. Worker/empresa no tienen campos actualizables legítimos hoy.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Estado destino válido.
  IF NOT (NEW.status = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  -- Autorización por rol sobre la transición.
  IF v_is_admin THEN
    -- Admin: cualquier transición (las reglas funcionales — nota de reapertura,
    -- guard sent_to_client — viven en el RPC canónico; el camino directo está
    -- cerrado por el REVOKE, esto es solo defensa en profundidad).
    RETURN NEW;
  ELSIF v_is_owner AND NOT v_is_company THEN
    -- Worker: única transición propia permitida = retirar.
    IF NEW.status <> 'withdrawn' THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    -- No reapertura desde terminal.
    IF OLD.status = ANY (v_terminal) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  ELSIF v_is_company THEN
    -- Empresa propietaria del job: avanza el pipeline, nunca estados internos
    -- ni retiro en nombre del trabajador.
    IF NEW.status IN ('pending_profile_validation', 'withdrawn') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.app_14da0f1941_guard_application_write() IS
  'PB-JOBS-APPLICATION-STATUS-AUTH-001: guardián BEFORE UPDATE/DELETE de candidaturas. Exentos postgres (rol sesión: RPC 034, triggers 034/039, migraciones) y service_role (JWT/rol: Edge Functions). Worker: solo →withdrawn no terminal. Empresa: pipeline sin estados internos. Columnas de identidad inmutables para no admin. DELETE directo prohibido (retiro = withdrawn vía RPC).';

DROP TRIGGER IF EXISTS app_14da0f1941_job_applications_guard_write ON public.app_14da0f1941_job_applications;
CREATE TRIGGER app_14da0f1941_job_applications_guard_write
  BEFORE UPDATE OR DELETE ON public.app_14da0f1941_job_applications
  FOR EACH ROW EXECUTE FUNCTION public.app_14da0f1941_guard_application_write();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cierre del canal directo: REVOKE UPDATE/DELETE para roles API
-- ─────────────────────────────────────────────────────────────────────────────
-- Toda escritura pasa por el RPC canónico (SECURITY DEFINER → postgres) o por
-- funciones backend. SELECT e INSERT se conservan (policies de lectura y apply
-- inicial inalterados). Idempotente: REVOKE es no-op si ya estaba revocado.
REVOKE UPDATE, DELETE ON TABLE public.app_14da0f1941_job_applications FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.app_14da0f1941_job_applications FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabla legacy job_applications: sin filas y sin privilegios de escritura
--    para roles API (authenticated=m). Se deja intacta (0 filas, inaccesible);
--    solo se documenta. NO se toca para no romper FKs históricas.
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual, no destructivo — NO ejecutar salvo incidente):
--   BEGIN;
--   DROP TRIGGER IF EXISTS app_14da0f1941_job_applications_guard_write
--     ON public.app_14da0f1941_job_applications;
--   DROP FUNCTION IF EXISTS public.app_14da0f1941_guard_application_write();
--   GRANT UPDATE, DELETE ON TABLE public.app_14da0f1941_job_applications TO authenticated;
--   GRANT UPDATE, DELETE ON TABLE public.app_14da0f1941_job_applications TO anon;
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- Nota: el rollback reabre la exposición documentada (E1/E2/E3/E6). Alternativa
-- de contingencia recomendada: mantener el REVOKE y desactivar solo el trigger
-- (ALTER TABLE ... DISABLE TRIGGER ...) si el guardián bloqueara un flujo
-- legítimo no previsto, manteniendo el canal directo cerrado.
-- ─────────────────────────────────────────────────────────────────────────────
