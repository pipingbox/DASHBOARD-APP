-- ═════════════════════════════════════════════════════════════════════════════
-- PB-ENT-E0A-COMPANY-CORE-CONCURRENCY-001
-- Hardening de concurrencia del invariante "último owner" de Company Core.
--
-- RCA (auditoría sobre sql/058):
--   pb_company_member_change_role / pb_company_member_remove /
--   pb_company_transfer_ownership implementan el invariante de último owner
--   como  SELECT count(*) owners → IF → UPDATE  SIN serialización por empresa.
--   Bajo READ COMMITTED (default PostgreSQL/Supabase), dos transacciones
--   concurrentes sobre la MISMA empresa con 2 owners pueden ambas leer
--   owner_count = 2, ambas pasar el check y ambas degradar/retirar a su owner,
--   dejando la empresa con 0 owners activos → violación del invariante.
--
-- Fix: serialización POR EMPRESA mediante  SELECT ... FOR UPDATE  sobre la fila
--   app_companies correspondiente, tomado ANTES de contar owners en cualquier
--   mutación que pueda afectar ownership. La fila app_companies actúa como
--   mutex lógico del tenant: operaciones sobre empresas distintas NO se
--   bloquean entre sí (lock por fila, no global). El lock se libera al
--   COMMIT/ROLLBACK de la transacción del RPC.
--
-- Aditivo: CREATE OR REPLACE sobre las tres funciones; sin cambios de schema,
-- grants ni semantics de autorización. Rollback: sql/059b.
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
  v_actor_role text;
  v_target public.app_company_memberships%ROWTYPE;
  v_company_status text;
  v_owner_count int;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_new_role NOT IN ('owner','admin','recruiter','viewer') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  SELECT * INTO v_target FROM public.app_company_memberships m WHERE m.id = p_membership_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_target.status <> 'active' THEN RAISE EXCEPTION 'not_active'; END IF;

  v_actor_role := public.pb_company_role(v_target.company_id);
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Solo owner gestiona owners/admins; owner/admin gestionan recruiter/viewer.
  IF v_target.role = 'owner' OR p_new_role = 'owner' OR v_target.role = 'admin' OR p_new_role = 'admin' THEN
    IF v_actor_role <> 'owner' THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSE
    IF v_actor_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  -- Invariante último owner: serializar por empresa ANTES de contar owners.
  -- El lock sobre la fila app_companies se mantiene hasta el fin de la
  -- transacción, por lo que el count y el UPDATE posteriores son atómicos
  -- respecto a cualquier otra mutación de ownership de la MISMA empresa.
  IF v_target.role = 'owner' AND p_new_role <> 'owner' THEN
    SELECT c.status INTO v_company_status
    FROM public.app_companies c
    WHERE c.id = v_target.company_id
    FOR UPDATE;
    SELECT count(*) INTO v_owner_count
    FROM public.app_company_memberships m
    WHERE m.company_id = v_target.company_id AND m.role = 'owner' AND m.status = 'active';
    IF v_company_status = 'active' AND v_owner_count <= 1 THEN
      RAISE EXCEPTION 'last_owner';
    END IF;
  END IF;

  UPDATE public.app_company_memberships
  SET role = p_new_role, updated_at = now()
  WHERE id = p_membership_id;

  PERFORM public.pb_company_audit('company_member_role_changed', 'company_membership',
    p_membership_id::text,
    json_build_object('company_id', v_target.company_id, 'new_role', p_new_role)::text);

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
  v_actor_role text;
  v_target public.app_company_memberships%ROWTYPE;
  v_company_status text;
  v_owner_count int;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_target FROM public.app_company_memberships m WHERE m.id = p_membership_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_target.status <> 'active' THEN RETURN true; END IF;  -- idempotente

  v_actor_role := public.pb_company_role(v_target.company_id);
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
    -- Serialización por empresa (ver nota en change_role).
    SELECT c.status INTO v_company_status
    FROM public.app_companies c
    WHERE c.id = v_target.company_id
    FOR UPDATE;
    SELECT count(*) INTO v_owner_count
    FROM public.app_company_memberships m
    WHERE m.company_id = v_target.company_id AND m.role = 'owner' AND m.status = 'active';
    IF v_company_status = 'active' AND v_owner_count <= 1 THEN
      RAISE EXCEPTION 'last_owner';
    END IF;
  END IF;

  UPDATE public.app_company_memberships
  SET status = 'removed', updated_at = now()
  WHERE id = p_membership_id;

  PERFORM public.pb_company_audit('company_member_removed', 'company_membership',
    p_membership_id::text, json_build_object('company_id', v_target.company_id)::text);

  RETURN true;
END $$;

-- ── pb_company_transfer_ownership ────────────────────────────────────────────
-- La transferencia degrada al owner actual a admin y promueve al target a owner.
-- Sin serialización, una transferencia concurrente con un remove/change_role del
-- target (o una segunda transferencia) podía dejar al tenant sin owner activo o
-- con estado inconsistente. Se toma el lock de la fila app_companies al inicio,
-- de modo que toda la operación (validación + ambos UPDATE) es atómica por
-- empresa.
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

  -- Serialización por empresa: lock de la fila app_companies durante toda la
  -- transferencia (validación + doble UPDATE).
  PERFORM 1 FROM public.app_companies c WHERE c.id = p_company_id FOR UPDATE;

  SELECT * INTO v_target FROM public.app_company_memberships m
  WHERE m.id = p_target_membership_id AND m.company_id = p_company_id;
  IF NOT FOUND OR v_target.status <> 'active' THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_target.user_id = v_actor THEN RAISE EXCEPTION 'cannot_transfer_to_self'; END IF;

  SELECT m.id INTO v_actor_membership_id
  FROM public.app_company_memberships m
  WHERE m.company_id = p_company_id AND m.user_id = v_actor AND m.status = 'active';

  -- Atómico: ambas actualizaciones en la misma transacción del RPC, ahora
  -- además serializadas por empresa vía el lock de app_companies.
  UPDATE public.app_company_memberships SET role = 'admin', updated_at = now()
  WHERE id = v_actor_membership_id;
  UPDATE public.app_company_memberships SET role = 'owner', updated_at = now()
  WHERE id = p_target_membership_id;

  PERFORM public.pb_company_audit('company_owner_transferred', 'company',
    p_company_id::text, json_build_object('new_owner_membership', p_target_membership_id)::text);

  RETURN true;
END $$;

-- Grants inalterados: las tres funciones ya tenían GRANT EXECUTE a
-- authenticated en sql/058; CREATE OR REPLACE preserva los grants existentes.
-- Se re-assertan por idempotencia defensiva (sin tocar PUBLIC/anon).
GRANT EXECUTE ON FUNCTION public.pb_company_member_change_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_company_member_remove(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_company_transfer_ownership(uuid, uuid) TO authenticated;
