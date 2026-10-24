-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de sql/061-pb-ent-e0a-company-core-concurrency-003.sql
--
-- Restaura EXACTAMENTE la definición de pb_company_transfer_ownership de
-- sql/060 (byte-idéntica, generada mecánicamente desde ese archivo), es decir:
-- SIN el guard NULL-safe (G1) y SIN la revalidación post-lock del actor (G2).
-- Tras aplicar este rollback, el bypass de outsider y la autorización stale
-- vuelven a ser alcanzables — verificado en harness: modo before061 ≡ estado
-- 058+059+060.
--
-- No toca schema ni grants (misma firma; re-assert defensivo idéntico).
-- ═════════════════════════════════════════════════════════════════════════════

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
