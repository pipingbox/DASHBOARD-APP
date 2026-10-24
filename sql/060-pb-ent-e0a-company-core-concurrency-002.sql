-- ═════════════════════════════════════════════════════════════════════════════
-- PB-ENT-E0A-COMPANY-CORE-CONCURRENCY-001 — iteración PO review PR #98
-- (segunda carrera: transfer_ownership ↔ remove/change_role de target NO-owner)
--
-- RCA-2 (PO review 2026-10-24, reproducido en harness, modo before060):
--   sql/059 serializó el invariante último owner tomando el mutex de empresa
--   (SELECT ... FOR UPDATE sobre app_companies) SOLO cuando el snapshot inicial
--   del target era role='owner'. pb_company_transfer_ownership sí toma el lock
--   siempre. Interleaving real (READ COMMITTED), empresa con 1 owner A + 1
--   admin B:
--     T1: transfer A→B  → auth OK → lock empresa → B (admin) → A=admin,
--         B=owner (row lock de B retenido) → ... → COMMIT
--     T2: remove(B)     → lee B ANTES del commit de T1: role='admin' → NO toma
--         lock de empresa → UPDATE B SET status='removed' → se bloquea en el
--         row lock de B → T1 commitea → T2 re-evalúa y marca removed → COMMIT
--   Estado final: A=admin/active + B=owner/removed → 0 owners activos.
--   Reproducido 2/2 en harness (TEST C1, modo before060): owners_after=0,
--   state_A=admin/active, state_B=owner/removed.
--
-- FIX (esta migración): la sección crítica se replantea para que TODA mutación
-- de membership capaz de interferir con ownership quede serializada por
-- company_id ANTES de validar/mutar:
--   1. Lectura inicial sin lock solo para resolver company_id (inmutable).
--   2. Lock incondicional de la fila app_companies (mutex por empresa, nunca
--      global: operaciones en empresas distintas no se bloquean — test D).
--   3. Re-lectura del target POST-LOCK y validación (estado, autorización,
--      invariante) sobre el estado fresco, nunca sobre el snapshot previo.
--   4. Orden de locks uniforme (empresa → memberships) → sin deadlocks entre
--      estos RPCs (se serializan en la fila de empresa).
--   Idempotencia preservada: remove sobre membership ya no-activa devuelve
--   true (no-op) evaluado sobre el estado post-lock.
--
-- CONTRATO CANÓNICO de pb_company_transfer_ownership (resolución de la
-- discrepancia señalada en la revisión: sql/058 documentaba target "active
-- non-owner" pero el código no lo imponía):
--   El target DEBE ser una membership activa de la empresa con role distinto
--   de 'owner'. Transferir a un miembro que ya es owner se rechaza con
--   target_already_owner (nuevo código de error, aditivo; mapeado en
--   app/frontend/src/lib/companyCore.ts + i18n companyCore.errors.*).
--   Se mantiene: actor owner (forbidden), no a uno mismo
--   (cannot_transfer_to_self), target activo o not_found.
--
-- Aditivo: CREATE OR REPLACE sobre las tres funciones; sin cambios de schema;
-- grants idénticos (re-assert defensivo); authorization semantics mantenidas
-- (mismas reglas, evaluadas sobre estado post-lock). Rollback: sql/060b.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── pb_company_member_change_role ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_company_member_change_role(
  p_membership_id uuid,
  p_new_role     text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id uuid;
  v_actor_role text;
  v_target public.app_company_memberships%ROWTYPE;
  v_company_status text;
  v_owner_count int;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_new_role NOT IN ('owner','admin','recruiter','viewer') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  -- Lectura sin lock SOLO para resolver company_id (inmutable: ningún RPC
  -- reasigna una membership a otra empresa).
  SELECT m.company_id INTO v_company_id
  FROM public.app_company_memberships m WHERE m.id = p_membership_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  -- Mutex por empresa INCONDICIONAL: cualquier mutación de membership se
  -- serializa aquí antes de validar/mutar (RCA-2). Lock por fila de
  -- app_companies: empresas distintas no se bloquean entre sí.
  SELECT c.status INTO v_company_status
  FROM public.app_companies c
  WHERE c.id = v_company_id
  FOR UPDATE;

  -- Re-lectura del target POST-LOCK: todas las decisiones usan estado fresco.
  SELECT * INTO v_target FROM public.app_company_memberships m WHERE m.id = p_membership_id;
  IF v_target.status <> 'active' THEN RAISE EXCEPTION 'not_active'; END IF;

  v_actor_role := public.pb_company_role(v_company_id);
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Solo owner gestiona owners/admins; owner/admin gestionan recruiter/viewer.
  IF v_target.role = 'owner' OR p_new_role = 'owner' OR v_target.role = 'admin' OR p_new_role = 'admin' THEN
    IF v_actor_role <> 'owner' THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSE
    IF v_actor_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  -- Invariante último owner: el count ya es atómico respecto a cualquier otra
  -- mutación de la MISMA empresa (todas pasan por el mismo mutex).
  IF v_target.role = 'owner' AND p_new_role <> 'owner' THEN
    SELECT count(*) INTO v_owner_count
    FROM public.app_company_memberships m
    WHERE m.company_id = v_company_id AND m.role = 'owner' AND m.status = 'active';
    IF v_company_status = 'active' AND v_owner_count <= 1 THEN
      RAISE EXCEPTION 'last_owner';
    END IF;
  END IF;

  UPDATE public.app_company_memberships
  SET role = p_new_role, updated_at = now()
  WHERE id = p_membership_id;

  PERFORM public.pb_company_audit('company_member_role_changed', 'company_membership',
    p_membership_id::text,
    json_build_object('company_id', v_company_id, 'new_role', p_new_role)::text);

  RETURN true;
END $$;

-- ── pb_company_member_remove ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pb_company_member_remove(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id uuid;
  v_actor_role text;
  v_target public.app_company_memberships%ROWTYPE;
  v_company_status text;
  v_owner_count int;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- company_id primero (inmutable), lock después: ver change_role / RCA-2.
  SELECT m.company_id INTO v_company_id
  FROM public.app_company_memberships m WHERE m.id = p_membership_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  -- Mutex por empresa INCONDICIONAL — también para targets no-owner: un target
  -- admin/recruiter puede estar siendo promovido a owner por una transferencia
  -- concurrente (RCA-2); sin este lock el remove escapaba a la serialización.
  SELECT c.status INTO v_company_status
  FROM public.app_companies c
  WHERE c.id = v_company_id
  FOR UPDATE;

  -- Re-lectura POST-LOCK. Idempotencia sobre estado fresco: si otra operación
  -- ya retiró la membership mientras esperábamos el mutex, es un no-op.
  SELECT * INTO v_target FROM public.app_company_memberships m WHERE m.id = p_membership_id;
  IF v_target.status <> 'active' THEN RETURN true; END IF;

  v_actor_role := public.pb_company_role(v_company_id);
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Uno puede retirarse a sí mismo (salir de la empresa), salvo último owner.
  IF v_target.user_id <> v_actor THEN
    IF v_target.role IN ('owner','admin') THEN
      IF v_actor_role <> 'owner' THEN RAISE EXCEPTION 'forbidden'; END IF;
    ELSE
      IF v_actor_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
    END IF;
  END IF;

  IF v_target.role = 'owner' THEN
    SELECT count(*) INTO v_owner_count
    FROM public.app_company_memberships m
    WHERE m.company_id = v_company_id AND m.role = 'owner' AND m.status = 'active';
    IF v_company_status = 'active' AND v_owner_count <= 1 THEN
      RAISE EXCEPTION 'last_owner';
    END IF;
  END IF;

  UPDATE public.app_company_memberships
  SET status = 'removed', updated_at = now()
  WHERE id = p_membership_id;

  PERFORM public.pb_company_audit('company_member_removed', 'company_membership',
    p_membership_id::text, json_build_object('company_id', v_company_id)::text);

  RETURN true;
END $$;

-- ── pb_company_transfer_ownership ────────────────────────────────────────────
-- CONTRATO CANÓNICO (documentado en sql/058, ahora impuesto por el código):
--   target = membership ACTIVA de la empresa con role <> 'owner'.
--   Violaciones: not_found (inexistente/no activa), cannot_transfer_to_self,
--   forbidden (actor no owner), target_already_owner (target ya owner).
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
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.pb_company_role(p_company_id) <> 'owner' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Mutex por empresa durante toda la transferencia (validación + doble
  -- UPDATE); compartido con change_role/remove → serialización total de las
  -- mutaciones de membership de la empresa (RCA-2).
  PERFORM 1 FROM public.app_companies c WHERE c.id = p_company_id FOR UPDATE;

  SELECT * INTO v_target FROM public.app_company_memberships m
  WHERE m.id = p_target_membership_id AND m.company_id = p_company_id;
  IF NOT FOUND OR v_target.status <> 'active' THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_target.user_id = v_actor THEN RAISE EXCEPTION 'cannot_transfer_to_self'; END IF;
  -- Contrato canónico: el target debe ser NO-owner (ver cabecera).
  IF v_target.role = 'owner' THEN RAISE EXCEPTION 'target_already_owner'; END IF;

  SELECT m.id INTO v_actor_membership_id
  FROM public.app_company_memberships m
  WHERE m.company_id = p_company_id AND m.user_id = v_actor AND m.status = 'active';

  -- Atómico y serializado por empresa: el owner actual queda admin y el target
  -- pasa a owner; nunca puede coexistir con un remove/change_role del target.
  UPDATE public.app_company_memberships SET role = 'admin', updated_at = now()
  WHERE id = v_actor_membership_id;
  UPDATE public.app_company_memberships SET role = 'owner', updated_at = now()
  WHERE id = p_target_membership_id;

  PERFORM public.pb_company_audit('company_owner_transferred', 'company',
    p_company_id::text, json_build_object('new_owner_membership', p_target_membership_id)::text);

  RETURN true;
END $$;

-- Grants inalterados (mismas firmas; CREATE OR REPLACE preserva grants).
GRANT EXECUTE ON FUNCTION public.pb_company_member_change_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_company_member_remove(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_company_transfer_ownership(uuid, uuid) TO authenticated;
