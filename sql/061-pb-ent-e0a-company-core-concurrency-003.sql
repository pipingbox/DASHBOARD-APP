-- ═════════════════════════════════════════════════════════════════════════════
-- PB-ENT-E0A-COMPANY-CORE-CONCURRENCY-001 — iteración 2 PO review PR #98
-- (G1: AUTH NULL BYPASS + G2: TOCTOU de autorización del actor, en
--  pb_company_transfer_ownership)
--
-- G1 — AUTH NULL BYPASS (confirmado en 058/059/060, reproducido en harness F6):
--   pb_company_role(p_company_id) devuelve NULL para un actor sin membership
--   activa. En PostgreSQL, `NULL <> 'owner'` evalúa a NULL y `IF NULL THEN` no
--   ejecuta la rama → el guard `forbidden` NO se levantaba para outsiders.
--   Además el SELECT de la membership del actor no comprobaba FOUND: el UPDATE
--   del actor afectaba 0 filas y la función CONTINUABA promoviendo el target a
--   owner. Como la RPC es SECURITY DEFINER con EXECUTE a `authenticated`, esto
--   era un bypass de autorización real (no dependía de la opacidad de los IDs).
--   BEFORE (harness F6, modo before061): outsider autenticado ejecuta transfer
--   → retorna true → target admin pasa a owner (2 owners: A + B).
--
-- G2 — TOCTOU DE AUTORIZACIÓN DEL ACTOR (confirmado, reproducido en C3a/C3b):
--   El ownership del actor se comprobaba ANTES de adquirir el mutex de
--   app_companies. Si otro owner adquiría el mutex y degradaba/retiraba al
--   actor mientras transfer esperaba, al reanudarse la transferencia usaba una
--   autorización stale y completaba la promoción del target.
--   BEFORE (harness C3, modo before061): C (owner) retiene el mutex, A inicia
--   transfer A→B y bloquea; C degrada (C3a) o retira (C3b) a A y commitea;
--   T1 reanuda y COMPLETA la transferencia: B queda owner pese a que A ya no
--   era owner activo.
--
-- FIX (esta migración; orden recomendado por el PO):
--   1. auth.uid() IS NOT NULL (not_authenticated).
--   2. Guard temprano NULL-SAFE: pb_company_role IS DISTINCT FROM 'owner'
--      (fail-closed: NULL → forbidden) — fast path sin lock.
--   3. Lock de empresa (app_companies FOR UPDATE) — mutex por empresa, nunca
--      global; orden de locks empresa→memberships (sin deadlock).
--   4. REVALIDACIÓN POST-LOCK: actor sigue siendo membership activa con
--      role='owner' (IS DISTINCT FROM → forbidden). La autorización que
--      gobierna la mutación es post-lock.
--   5. Relectura/validación del target post-lock (not_found / self /
--      target_already_owner).
--   6. Membership owner activa del actor: NOT FOUND → forbidden (G1: nunca
--      continuar sin ella).
--   7. Mutaciones + auditoría.
--
-- change_role y remove NO necesitan cambio: desde 060 evalúan el rol del actor
-- POST-LOCK y con comprobación NULL-safe (`IS NULL → forbidden`).
--
-- Aditivo: CREATE OR REPLACE de una sola función; misma firma; grants
-- inalterados (re-assert defensivo); sin cambios de schema ni de producción.
-- Rollback: sql/061b (restaura byte-idéntica la definición de 060).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pb_company_transfer_ownership(
  p_company_id          uuid,
  p_target_membership_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_membership_id uuid;
  v_target public.app_company_memberships%ROWTYPE;
BEGIN
  -- 1. Actor autenticado.
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- 2. Guard temprano NULL-SAFE (fast path sin lock): pb_company_role devuelve
  --    NULL para outsiders; `NULL <> 'owner'` sería NULL (bypass G1) — por eso
  --    IS DISTINCT FROM (fail-closed).
  IF public.pb_company_role(p_company_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 3. Mutex por empresa durante toda la transferencia (compartido con
  --    change_role/remove; orden de locks empresa→memberships).
  PERFORM 1 FROM public.app_companies c WHERE c.id = p_company_id FOR UPDATE;

  -- 4. REVALIDACIÓN POST-LOCK de la autorización del actor (G2): si otro owner
  --    degradó/retiró al actor mientras esperábamos el mutex, la transferencia
  --    se rechaza — la autorización que gobierna la mutación es post-lock.
  IF public.pb_company_role(p_company_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 5. Relectura/validación del target post-lock (contrato canónico 060:
  --    target = membership activa con role <> 'owner').
  SELECT * INTO v_target FROM public.app_company_memberships m
  WHERE m.id = p_target_membership_id AND m.company_id = p_company_id;
  IF NOT FOUND OR v_target.status <> 'active' THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_target.user_id = v_actor THEN RAISE EXCEPTION 'cannot_transfer_to_self'; END IF;
  IF v_target.role = 'owner' THEN RAISE EXCEPTION 'target_already_owner'; END IF;

  -- 6. Membership owner activa del actor: obligatoria para mutar (G1: sin
  --    comprobación FOUND el UPDATE del actor era un no-op silencioso y la
  --    función seguía promoviendo al target).
  SELECT m.id INTO v_actor_membership_id
  FROM public.app_company_memberships m
  WHERE m.company_id = p_company_id AND m.user_id = v_actor AND m.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- 7. Atómico y serializado por empresa: owner actual → admin, target → owner.
  UPDATE public.app_company_memberships SET role = 'admin', updated_at = now()
  WHERE id = v_actor_membership_id;
  UPDATE public.app_company_memberships SET role = 'owner', updated_at = now()
  WHERE id = p_target_membership_id;

  PERFORM public.pb_company_audit('company_owner_transferred', 'company',
    p_company_id::text, json_build_object('new_owner_membership', p_target_membership_id)::text);

  RETURN true;
END $$;

-- Grants inalterados (misma firma; CREATE OR REPLACE preserva grants).
GRANT EXECUTE ON FUNCTION public.pb_company_transfer_ownership(uuid, uuid) TO authenticated;
