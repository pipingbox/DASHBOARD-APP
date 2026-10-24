-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PB-ENT-E0A-COMPANY-CORE-CONCURRENCY-001 (sql/059)
-- Restaura las versiones de sql/058 de las tres funciones mutadoras de
-- ownership (sin el lock FOR UPDATE por empresa). Solo para QA/rollback
-- controlado; NO aplicar en producción una vez validado el hardening.
-- ═════════════════════════════════════════════════════════════════════════════

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

  IF v_target.role = 'owner' OR p_new_role = 'owner' OR v_target.role = 'admin' OR p_new_role = 'admin' THEN
    IF v_actor_role <> 'owner' THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSE
    IF v_actor_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  IF v_target.role = 'owner' AND p_new_role <> 'owner' THEN
    SELECT c.status INTO v_company_status FROM public.app_companies c WHERE c.id = v_target.company_id;
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
  IF v_target.status <> 'active' THEN RETURN true; END IF;

  v_actor_role := public.pb_company_role(v_target.company_id);
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_target.user_id <> v_actor THEN
    IF v_target.role IN ('owner','admin') THEN
      IF v_actor_role <> 'owner' THEN RAISE EXCEPTION 'forbidden'; END IF;
    ELSE
      IF v_actor_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
    END IF;
  END IF;

  IF v_target.role = 'owner' THEN
    SELECT c.status INTO v_company_status FROM public.app_companies c WHERE c.id = v_target.company_id;
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

  SELECT * INTO v_target FROM public.app_company_memberships m
  WHERE m.id = p_target_membership_id AND m.company_id = p_company_id;
  IF NOT FOUND OR v_target.status <> 'active' THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_target.user_id = v_actor THEN RAISE EXCEPTION 'cannot_transfer_to_self'; END IF;

  SELECT m.id INTO v_actor_membership_id
  FROM public.app_company_memberships m
  WHERE m.company_id = p_company_id AND m.user_id = v_actor AND m.status = 'active';

  UPDATE public.app_company_memberships SET role = 'admin', updated_at = now()
  WHERE id = v_actor_membership_id;
  UPDATE public.app_company_memberships SET role = 'owner', updated_at = now()
  WHERE id = p_target_membership_id;

  PERFORM public.pb_company_audit('company_owner_transferred', 'company',
    p_company_id::text, json_build_object('new_owner_membership', p_target_membership_id)::text);

  RETURN true;
END $$;
