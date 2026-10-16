-- PB-CE-COMPANY-CORE-001-ROLLBACK — Reversión de sql/041-pb-ce-company-core-001.sql
--
-- ══════════════════════════════════════════════════════════════════════════════
-- Rama: pb-ce-company-core-001 · Revierte: sql/041-pb-ce-company-core-001.sql
-- ══════════════════════════════════════════════════════════════════════════════
--
-- QUÉ HACE
--   Deshace TODO lo creado por sql/041: los 8 RPCs de gestión, las 3 funciones
--   helper de membresía, la función de auditoría y las tres tablas nuevas con
--   sus policies, índices y constraints.
--
-- QUÉ NO TOCA (por diseño)
--   · Ninguna tabla/columna/dato LEGACY (profiles, jobs, applications, …) — el
--     forward no los modificó, así que no hay nada que restaurar ahí.
--   · Las filas del audit log ya escritas por los RPCs: son historial inmutable
--     y no se borran (coherente con la doctrina del audit log).
--   · El frontend y los eventos PostHog: tras el rollback quedan inertes porque
--     las tablas/RPCs dejan de existir; retirarlos del código es un commit aparte.
--
-- PÉRDIDA DE DATOS EXPLÍCITA
--   Se borran las tres tablas nuevas con su contenido (tenants, membresías e
--   invitaciones, incluidas las creadas por la migración legacy). Es aceptable
--   porque (a) son copia paralela no destructiva del legacy — las cuentas
--   empresa originales siguen intactas en profiles/jobs/applications — y
--   (b) el rollback está pensado para QA antes de que exista uso real del tenant.
--
-- ORDEN
--   1. RPCs de gestión (usan helpers y tablas).
--   2. Función de auditoría pb_company_audit.
--   3. Funciones helper (las policies de las tablas las referencian; las
--      policies se eliminan con el DROP TABLE, pero dropear helpers antes de las
--      tablas es el orden siempre seguro).
--   4. Tablas (policies, índices y constraints se van con ellas).
--
-- IDEMPOTENTE: todo es IF EXISTS.
-- EJECUCIÓN: Supabase SQL Editor (service role) o psql. Transacción única.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. RPCs de gestión ───────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.pb_company_create(text, text);
DROP FUNCTION IF EXISTS public.pb_company_invite(uuid, text, text);
DROP FUNCTION IF EXISTS public.pb_company_invitation_accept(text);
DROP FUNCTION IF EXISTS public.pb_company_invitation_reject(text);
DROP FUNCTION IF EXISTS public.pb_company_invitation_revoke(uuid);
DROP FUNCTION IF EXISTS public.pb_company_member_change_role(uuid, text);
DROP FUNCTION IF EXISTS public.pb_company_member_remove(uuid);
DROP FUNCTION IF EXISTS public.pb_company_transfer_ownership(uuid, uuid);
DROP FUNCTION IF EXISTS public.pb_company_members(uuid);
DROP FUNCTION IF EXISTS public.pb_company_my_context();

-- ── 2. Auditoría ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.pb_company_audit(text, text, text, text);

-- ── 3. Helpers de membresía ──────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.pb_company_role(uuid);
DROP FUNCTION IF EXISTS public.pb_is_company_member(uuid);
DROP FUNCTION IF EXISTS public.pb_is_company_admin_or_owner(uuid);

-- ── 4. Tablas (policies, índices y constraints se eliminan con ellas) ────────

DROP TABLE IF EXISTS public.app_company_invitations;
DROP TABLE IF EXISTS public.app_company_memberships;
DROP TABLE IF EXISTS public.app_companies;

COMMIT;

-- ── Verificación post-rollback ───────────────────────────────────────────────
-- Esperado: 0 tablas, 0 funciones, 0 policies residuales del ticket.

DO $$
DECLARE
  v_tables   integer;
  v_funcs    integer;
  v_policies integer;
BEGIN
  SELECT count(*) INTO v_tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('app_companies', 'app_company_memberships', 'app_company_invitations');

  SELECT count(*) INTO v_funcs
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'pb_company_create', 'pb_company_invite', 'pb_company_invitation_accept',
      'pb_company_invitation_reject', 'pb_company_invitation_revoke',
      'pb_company_member_change_role',
      'pb_company_member_remove', 'pb_company_transfer_ownership',
      'pb_company_members', 'pb_company_my_context', 'pb_company_audit',
      'pb_company_role', 'pb_is_company_member', 'pb_is_company_admin_or_owner'
    );

  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('app_companies', 'app_company_memberships', 'app_company_invitations');

  IF v_tables <> 0 OR v_funcs <> 0 OR v_policies <> 0 THEN
    RAISE EXCEPTION 'Rollback incompleto: tablas=% funciones=% policies=%',
      v_tables, v_funcs, v_policies;
  END IF;

  RAISE NOTICE 'PB-CE-COMPANY-CORE-001-ROLLBACK OK: 0 objetos residuales del ticket.';
END $$;

-- FIN DE PB-CE-COMPANY-CORE-001-ROLLBACK
