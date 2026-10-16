-- PB-CE-COMPANY-CORE-001 — Company tenant, memberships and team accounts foundation
--
-- ══════════════════════════════════════════════════════════════════════════════
-- Rama: pb-ce-company-core-001 · Base: 5e1da21fb69fb2748dee84fbd151cb2a0b22ea11
-- Estado: IMPLEMENTACIÓN EN RAMA — NO APLICAR A PRODUCCIÓN hasta GO explícito del PO.
-- ADR: docs/PB-CE-COMPANY-CORE-001-ADR.md
-- ══════════════════════════════════════════════════════════════════════════════
--
-- ALCANCE
--
--   Modelo nuevo de tenant empresarial INDEPENDIENTE del perfil individual:
--     · app_companies            — entidad empresa (ciclo de vida + verificación)
--     · app_company_memberships  — muchos-a-muchos usuario↔empresa con rol
--     · app_company_invitations  — invitaciones de un solo uso (solo hash persistido)
--   Más RPCs SECURITY DEFINER para toda mutación de equipo, funciones helper de
--   membresía, y una migración de compatibilidad NO destructiva de las cuentas
--   empresariales legacy (profiles.account_type='company').
--
-- PRINCIPIOS (GO del PO 2026-10-16)
--
--   · La seguridad NUNCA se basa en un company_id/role del perfil ni de metadata
--     manipulable del cliente. Toda autorización se resuelve contra memberships
--     activas en BD (RLS + validación interna del RPC).
--   · RLS ENABLE + FORCE en las 3 tablas. Cero escritura directa para
--     authenticated: toda mutación pasa por RPC SECURITY DEFINER (search_path fijo).
--   · Invariantes de owner (≥1 owner por empresa activa, no degradar/eliminar al
--     último, transferencia atómica) dentro de la transacción del RPC.
--   · Tokens de invitación generados en backend, solo SHA-256 persistido, un solo
--     uso, expiración, revocación, anti-replay, anti-enumeración.
--   · Compatibilidad: jobs/applications mantienen company_user_id en esta fase.
--     El tenant gobierna EQUIPO; el re-mapeo de propiedad de datos es una fase
--     posterior fuera de alcance.
--
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 0 — PRECONDICIONES.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.app_14da0f1941_profiles') IS NULL THEN
    RAISE EXCEPTION 'PRECONDICION FALLIDA: falta app_14da0f1941_profiles.';
  END IF;
  IF to_regclass('public.app_14da0f1941_audit_logs') IS NULL THEN
    RAISE EXCEPTION 'PRECONDICION FALLIDA: falta app_14da0f1941_audit_logs (se reutiliza para auditoría).';
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 1 — TABLAS
-- ═════════════════════════════════════════════════════════════════════════════

-- ── app_companies ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_companies (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  -- Ciclo de vida operativo.
  status                  text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','suspended','archived')),
  -- Verificación empresarial. Crear una empresa NUNCA la marca como verificada.
  verification_status     text NOT NULL DEFAULT 'unverified'
                          CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  country                 text,
  registration_number     text,
  created_by              uuid NOT NULL REFERENCES public.app_14da0f1941_profiles(user_id) ON DELETE RESTRICT,
  -- Mapping trazable a la cuenta legacy (profiles.user_id) de la que proviene.
  legacy_profile_user_id  uuid REFERENCES public.app_14da0f1941_profiles(user_id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
-- Una empresa legacy → un solo tenant (idempotencia de la migración).
CREATE UNIQUE INDEX IF NOT EXISTS app_companies_legacy_profile_uniq
  ON public.app_companies (legacy_profile_user_id)
  WHERE legacy_profile_user_id IS NOT NULL;

-- ── app_company_memberships ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_company_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.app_companies(id) ON DELETE RESTRICT,
  user_id     uuid NOT NULL REFERENCES public.app_14da0f1941_profiles(user_id) ON DELETE RESTRICT,
  role        text NOT NULL CHECK (role IN ('owner','admin','recruiter','viewer')),
  -- 'removed' conserva el historial (no DELETE) para auditoría y reconciliación.
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  invited_by  uuid REFERENCES public.app_14da0f1941_profiles(user_id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS app_company_memberships_user_idx
  ON public.app_company_memberships (user_id);
CREATE INDEX IF NOT EXISTS app_company_memberships_company_idx
  ON public.app_company_memberships (company_id);
-- A lo sumo UNA membership activa por (company,user): reactivar actualiza, no duplica.
CREATE UNIQUE INDEX IF NOT EXISTS app_company_memberships_active_uniq
  ON public.app_company_memberships (company_id, user_id)
  WHERE status = 'active';

-- ── app_company_invitations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_company_invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.app_companies(id) ON DELETE RESTRICT,
  email_normalized text NOT NULL,                 -- lower(trim(email)); anti-enumeración por respuesta
  role             text NOT NULL CHECK (role IN ('admin','recruiter','viewer')),  -- nunca owner por invitación
  token_hash       text NOT NULL,                 -- SHA-256 hex del token; el token plano NUNCA se persiste
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','rejected','revoked','expired')),
  invited_by       uuid NOT NULL REFERENCES public.app_14da0f1941_profiles(user_id) ON DELETE RESTRICT,
  expires_at       timestamptz NOT NULL,
  accepted_at      timestamptz,
  accepted_by      uuid REFERENCES public.app_14da0f1941_profiles(user_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_company_invitations_token_hash_uniq
  ON public.app_company_invitations (token_hash);
CREATE INDEX IF NOT EXISTS app_company_invitations_email_idx
  ON public.app_company_invitations (email_normalized);
CREATE INDEX IF NOT EXISTS app_company_invitations_company_idx
  ON public.app_company_invitations (company_id);
-- Idempotencia de invitaciones duplicadas: una pendiente por (empresa,email).
CREATE UNIQUE INDEX IF NOT EXISTS app_company_invitations_pending_uniq
  ON public.app_company_invitations (company_id, email_normalized)
  WHERE status = 'pending';

-- ═════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 2 — RLS (ENABLE + FORCE, cero escritura directa para authenticated)
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.app_companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_companies            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_company_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_company_memberships  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_company_invitations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_company_invitations  FORCE ROW LEVEL SECURITY;

-- Grants: authenticated puede LEER (RLS filtra filas); toda ESCRITURA va por RPC.
-- Revocamos escritura directa de la API para que la única vía de mutación sea el
-- RPC SECURITY DEFINER con validación interna de actor/empresa/rol/recurso.
GRANT SELECT ON public.app_companies           TO authenticated;
GRANT SELECT ON public.app_company_memberships TO authenticated;
GRANT SELECT ON public.app_company_invitations TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.app_companies           FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.app_company_memberships FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.app_company_invitations FROM authenticated;
-- service_role conserva acceso total (Edge Functions, migraciones, reconciliación).
GRANT ALL ON public.app_companies           TO service_role;
GRANT ALL ON public.app_company_memberships TO service_role;
GRANT ALL ON public.app_company_invitations TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 3 — FUNCIONES HELPER DE MEMBRESÍA (SECURITY DEFINER, search_path fijo)
-- ═════════════════════════════════════════════════════════════════════════════

-- Rol efectivo del actor en una empresa (NULL si no es miembro activo).
CREATE OR REPLACE FUNCTION public.pb_company_role(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT m.role
  FROM public.app_company_memberships m
  WHERE m.company_id = p_company_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  LIMIT 1;
$$;

-- ¿Es miembro activo (cualquier rol)?
CREATE OR REPLACE FUNCTION public.pb_is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_company_memberships m
    WHERE m.company_id = p_company_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;

-- ¿Es owner o admin activo?
CREATE OR REPLACE FUNCTION public.pb_is_company_admin_or_owner(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_company_memberships m
    WHERE m.company_id = p_company_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('owner','admin')
  );
$$;

REVOKE ALL ON FUNCTION public.pb_company_role(uuid)               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pb_is_company_member(uuid)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pb_is_company_admin_or_owner(uuid)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pb_company_role(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_is_company_member(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_is_company_admin_or_owner(uuid)  TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 4 — POLICIES RLS (lectura basada en memberships activas)
-- ═════════════════════════════════════════════════════════════════════════════

-- app_companies: visible si eres miembro activo. Sin escritura directa.
DROP POLICY IF EXISTS app_companies_select_member ON public.app_companies;
CREATE POLICY app_companies_select_member ON public.app_companies
  FOR SELECT TO authenticated
  USING (public.pb_is_company_member(id));

-- app_company_memberships: ves las membresías de tu empresa (y la tuya propia).
DROP POLICY IF EXISTS app_company_memberships_select ON public.app_company_memberships;
CREATE POLICY app_company_memberships_select ON public.app_company_memberships
  FOR SELECT TO authenticated
  USING (
    public.pb_is_company_member(company_id)
    OR user_id = auth.uid()
  );

-- app_company_invitations: solo owner/admin de la empresa lista invitaciones.
-- NUNCA expuesta por email del invitado (anti-enumeración).
DROP POLICY IF EXISTS app_company_invitations_select ON public.app_company_invitations;
CREATE POLICY app_company_invitations_select ON public.app_company_invitations
  FOR SELECT TO authenticated
  USING (public.pb_is_company_admin_or_owner(company_id));

-- ═════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 5 — AUDITORÍA (función SECURITY DEFINER; los RPCs la invocan)
-- ═════════════════════════════════════════════════════════════════════════════

-- audit_logs solo permite INSERT a admin. Esta función eleva controladamente para
-- que los RPCs registren sin conceder INSERT a authenticated. No expone escritura
-- arbitraria: el actor se fija al JWT del llamante, nunca a un parámetro.
CREATE OR REPLACE FUNCTION public.pb_company_audit(
  p_action_type text,
  p_target_type text,
  p_target_id   text,
  p_details     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_email text := auth.jwt() ->> 'email';
BEGIN
  INSERT INTO public.app_14da0f1941_audit_logs
    (actor_email, action_type, target_type, target_id, details)
  VALUES
    (COALESCE(v_email, 'unknown'), p_action_type, p_target_type, p_target_id, p_details);
END $$;

REVOKE ALL ON FUNCTION public.pb_company_audit(text,text,text,text) FROM PUBLIC;
-- Solo la invocan los RPCs (SECURITY DEFINER), no se expone a la API.
REVOKE EXECUTE ON FUNCTION public.pb_company_audit(text,text,text,text) FROM authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 6 — RPCs DE GESTIÓN (SECURITY DEFINER, validación interna)
-- ═════════════════════════════════════════════════════════════════════════════

-- ── pb_company_create ────────────────────────────────────────────────────────
-- Crea una empresa y otorga al creador la membership owner. NUNCA la marca
-- verificada (verification_status='unverified' por defecto). Idempotente por
-- (created_by, name): reinvocar con el mismo nombre devuelve la empresa existente.
CREATE OR REPLACE FUNCTION public.pb_company_create(
  p_name    text,
  p_country text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company_id uuid;
  v_actor uuid := auth.uid();
  v_name text := btrim(p_name);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  -- Idempotencia: misma empresa (creador+nombre) → devolver la existente.
  SELECT c.id INTO v_company_id
  FROM public.app_companies c
  WHERE c.created_by = v_actor AND c.name = v_name
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    RETURN v_company_id;
  END IF;

  INSERT INTO public.app_companies (name, country, created_by, status, verification_status)
  VALUES (v_name, p_country, v_actor, 'active', 'unverified')
  RETURNING id INTO v_company_id;

  INSERT INTO public.app_company_memberships (company_id, user_id, role, status, invited_by)
  VALUES (v_company_id, v_actor, 'owner', 'active', v_actor)
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET role = 'owner', status = 'active', updated_at = now();

  PERFORM public.pb_company_audit('company_created', 'company', v_company_id::text,
    json_build_object('name', v_name)::text);

  RETURN v_company_id;
END $$;

-- ── pb_company_invite ────────────────────────────────────────────────────────
-- Crea una invitación de un solo uso. Devuelve el TOKEN PLANO una única vez (para
-- que el frontend/Edge lo envíe por email) junto al id; solo se persiste el hash.
-- Idempotente: una invitación pendiente duplicada por (empresa,email) devuelve la
-- existente SIN nuevo token (anti-replay por duplicado).
-- Permisos: owner/admin invitan recruiter/viewer; solo owner invita admin.
CREATE OR REPLACE FUNCTION public.pb_company_invite(
  p_company_id uuid,
  p_email      text,
  p_role       text
)
RETURNS TABLE (invitation_id uuid, token text, already_pending boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_email text := lower(btrim(p_email));
  v_existing uuid;
  v_token text;
  v_inv uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF p_role NOT IN ('admin','recruiter','viewer') THEN
    RAISE EXCEPTION 'invalid_role';  -- nunca owner por invitación
  END IF;

  v_actor_role := public.pb_company_role(p_company_id);
  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'forbidden';  -- sin membership no revela si la empresa existe
  END IF;
  IF p_role = 'admin' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'forbidden';  -- solo owner invita admin
  END IF;
  IF p_role IN ('recruiter','viewer') AND v_actor_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Idempotencia: invitación pendiente existente → no reemitir token.
  SELECT i.id INTO v_existing
  FROM public.app_company_invitations i
  WHERE i.company_id = p_company_id
    AND i.email_normalized = v_email
    AND i.status = 'pending'
    AND i.expires_at > now()
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, NULL::text, true;
    RETURN;
  END IF;

  -- Token backend-only; solo se persiste el hash SHA-256.
  -- pgcrypto vive en el schema 'extensions': hay que cualificar SIEMPRE porque
  -- este RPC fija search_path='public','pg_temp' (sin extensions a propósito).
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.app_company_invitations
    (company_id, email_normalized, role, token_hash, status, invited_by, expires_at)
  VALUES
    (p_company_id, v_email, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'),
     'pending', v_actor, now() + interval '7 days')
  RETURNING id INTO v_inv;

  PERFORM public.pb_company_audit('company_invite_sent', 'company_invitation', v_inv::text,
    json_build_object('company_id', p_company_id, 'role', p_role)::text);

  RETURN QUERY SELECT v_inv, v_token, false;
END $$;

-- ── pb_company_invitation_accept ─────────────────────────────────────────────
-- Acepta una invitación por token. Rechaza expirado/revocado/manipulado/replay.
-- La cuenta autenticada debe coincidir con el email destinatario (anti-usurpación).
-- Devuelve la membership creada/actualizada. Anti-enumeración: token inválido →
-- genérico 'invalid_or_expired'.
CREATE OR REPLACE FUNCTION public.pb_company_invitation_accept(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_email text := lower(btrim(auth.jwt() ->> 'email'));
  v_hash text := encode(extensions.digest(COALESCE(p_token,''), 'sha256'), 'hex');
  v_inv public.app_company_invitations%ROWTYPE;
  v_membership_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_inv
  FROM public.app_company_invitations i
  WHERE i.token_hash = v_hash
  LIMIT 1;

  -- Anti-enumeración: cualquier token no válido devuelve el mismo error genérico.
  IF NOT FOUND
     OR v_inv.status <> 'pending'
     OR v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_or_expired';
  END IF;

  -- La aceptación requiere que la cuenta autenticada sea la destinataria.
  IF v_actor_email IS NULL OR v_actor_email <> v_inv.email_normalized THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  -- Marcar aceptada (un solo uso) + crear/reactivar membership, en una transacción.
  UPDATE public.app_company_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = v_actor
  WHERE id = v_inv.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_or_expired';  -- replay concurrente
  END IF;

  INSERT INTO public.app_company_memberships (company_id, user_id, role, status, invited_by)
  VALUES (v_inv.company_id, v_actor, v_inv.role, 'active', v_inv.invited_by)
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now()
  RETURNING id INTO v_membership_id;

  PERFORM public.pb_company_audit('company_invite_accepted', 'company_invitation', v_inv.id::text,
    json_build_object('company_id', v_inv.company_id, 'role', v_inv.role)::text);

  RETURN v_membership_id;
END $$;

-- ── pb_company_invitation_revoke ─────────────────────────────────────────────
-- Revoca una invitación pendiente. owner/admin. Idempotente (revocar una ya
-- revocada no falla).
CREATE OR REPLACE FUNCTION public.pb_company_invitation_revoke(p_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT i.company_id INTO v_company_id
  FROM public.app_company_invitations i
  WHERE i.id = p_invitation_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.pb_is_company_admin_or_owner(v_company_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.app_company_invitations
  SET status = 'revoked'
  WHERE id = p_invitation_id AND status = 'pending';

  IF FOUND THEN
    PERFORM public.pb_company_audit('company_invite_revoked', 'company_invitation',
      p_invitation_id::text, json_build_object('company_id', v_company_id)::text);
  END IF;

  RETURN true;
END $$;

-- ── pb_company_invitation_reject ─────────────────────────────────────────────
-- Rechaza una invitación por token (el destinatario declina). Mismas defensas
-- que accept: anti-enumeración, un solo uso, email del JWT = destinatario.
CREATE OR REPLACE FUNCTION public.pb_company_invitation_reject(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_email text := lower(btrim(auth.jwt() ->> 'email'));
  v_hash text := encode(extensions.digest(COALESCE(p_token,''), 'sha256'), 'hex');
  v_inv public.app_company_invitations%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_inv
  FROM public.app_company_invitations i
  WHERE i.token_hash = v_hash
  LIMIT 1;

  IF NOT FOUND
     OR v_inv.status <> 'pending'
     OR v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_or_expired';
  END IF;

  IF v_actor_email IS NULL OR v_actor_email <> v_inv.email_normalized THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  UPDATE public.app_company_invitations
  SET status = 'rejected'
  WHERE id = v_inv.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_or_expired';  -- replay concurrente
  END IF;

  PERFORM public.pb_company_audit('company_invite_rejected', 'company_invitation', v_inv.id::text,
    json_build_object('company_id', v_inv.company_id, 'role', v_inv.role)::text);

  RETURN true;
END $$;

-- ── pb_company_member_change_role ────────────────────────────────────────────
-- Cambia el rol de una membership activa. Invariantes:
--   · admin no puede tocar owners ni crear admins.
--   · no se puede degradar/eliminar al último owner de una empresa activa.
--   · owner no puede cambiar su propio rol si es el último owner.
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

  -- Invariante último owner: no degradar al único owner de una empresa activa.
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

-- ── pb_company_member_remove ─────────────────────────────────────────────────
-- Retira una membership (marca 'removed'; NO borra — conserva historial/auditoría).
-- Revoca acceso inmediatamente (status != 'active' excluido de pb_company_role).
-- Invariantes: no retirar al último owner de una empresa activa; admin no retira
-- owners/admins.
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

-- ── pb_company_transfer_ownership ────────────────────────────────────────────
-- Transferencia atómica: el owner actual pasa a admin y el target pasa a owner en
-- UNA transacción. Solo owner. El target debe ser miembro activo no-owner.
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

  -- Atómico: ambas actualizaciones en la misma transacción del RPC.
  UPDATE public.app_company_memberships SET role = 'admin', updated_at = now()
  WHERE id = v_actor_membership_id;
  UPDATE public.app_company_memberships SET role = 'owner', updated_at = now()
  WHERE id = p_target_membership_id;

  PERFORM public.pb_company_audit('company_owner_transferred', 'company',
    p_company_id::text, json_build_object('new_owner_membership', p_target_membership_id)::text);

  RETURN true;
END $$;

-- ── pb_company_members ───────────────────────────────────────────────────────
-- Lista las membresías activas de una empresa con el nombre visible del miembro.
-- profiles solo es legible por el propio usuario (RLS), así que esta función
-- eleva controladamente y SOLO expone full_name de compañeros de empresa si el
-- actor es miembro activo de ESA empresa (validación interna, no del cliente).
CREATE OR REPLACE FUNCTION public.pb_company_members(p_company_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  full_name text,
  role text,
  is_you boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT m.id, m.user_id, p.full_name, m.role, (m.user_id = auth.uid()), m.created_at
  FROM public.app_company_memberships m
  LEFT JOIN public.app_14da0f1941_profiles p ON p.user_id = m.user_id
  WHERE m.company_id = p_company_id
    AND m.status = 'active'
    AND public.pb_is_company_member(p_company_id)
  ORDER BY m.created_at ASC;
$$;

-- ── pb_company_my_context ────────────────────────────────────────────────────
-- Devuelve las empresas (membresías activas) del actor para el selector de
-- contexto. Solo lectura vía RPC (aunque RLS ya lo permite; se expone como RPC
-- para un punto de acceso único y auditable).
CREATE OR REPLACE FUNCTION public.pb_company_my_context()
RETURNS TABLE (company_id uuid, company_name text, role text, verification_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.id, c.name, m.role, c.verification_status
  FROM public.app_company_memberships m
  JOIN public.app_companies c ON c.id = m.company_id
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'
    AND c.status = 'active'
  ORDER BY c.created_at ASC;
$$;

-- Grants de ejecución: solo authenticated; cada RPC valida al actor internamente.
-- pb_company_audit queda EXCLUIDA: solo la invocan otros RPCs (revocada arriba).
DO $$
DECLARE
  f text;
BEGIN
  FOR f IN SELECT proname FROM pg_proc
           WHERE proname LIKE 'pb\_company\_%'
             AND proname <> 'pb_company_audit'
             AND pronamespace='public'::regnamespace
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO authenticated', f);
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 7 — MIGRACIÓN DE COMPATIBILIDAD (legacy company accounts → tenants)
-- Idempotente · no destructiva · reconciliable · reversible en QA.
-- ═════════════════════════════════════════════════════════════════════════════

-- Cada perfil account_type='company' produce 1 app_companies + 1 membership owner.
-- ON CONFLICT sobre el unique index legacy lo hace idempotente (re-ejecutar no duplica).
INSERT INTO public.app_companies (name, country, created_by, legacy_profile_user_id, status, verification_status)
SELECT
  COALESCE(NULLIF(btrim(p.company), ''), 'Company ' || left(p.user_id::text, 8)),
  p.company_country,
  p.user_id,
  p.user_id,
  'active',
  CASE WHEN p.company_verified THEN 'verified' ELSE 'unverified' END
FROM public.app_14da0f1941_profiles p
WHERE p.account_type = 'company'
ON CONFLICT (legacy_profile_user_id) WHERE legacy_profile_user_id IS NOT NULL
DO NOTHING;

INSERT INTO public.app_company_memberships (company_id, user_id, role, status, invited_by)
SELECT c.id, c.legacy_profile_user_id, 'owner', 'active', c.legacy_profile_user_id
FROM public.app_companies c
WHERE c.legacy_profile_user_id IS NOT NULL
ON CONFLICT (company_id, user_id) DO NOTHING;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (ejecutar tras COMMIT)
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Tablas + RLS FORCE.
-- SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
-- WHERE relname IN ('app_companies','app_company_memberships','app_company_invitations');

-- 2. ACL: authenticated solo SELECT; sin anon/PUBLIC.
-- SELECT c.relname, a.grantee::regrole::text, a.privilege_type
-- FROM pg_class c, aclexplode(c.relacl) a
-- WHERE c.relname IN ('app_companies','app_company_memberships','app_company_invitations')
-- ORDER BY c.relname, grantee;

-- 3. RPCs SECURITY DEFINER presentes.
-- SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'pb_company%' ORDER BY proname;

-- 4. Migración legacy: nº tenants = nº cuentas company; cada una con owner.
-- SELECT
--   (SELECT count(*) FROM public.app_14da0f1941_profiles WHERE account_type='company') AS legacy_company_accounts,
--   (SELECT count(*) FROM public.app_companies WHERE legacy_profile_user_id IS NOT NULL) AS migrated_tenants,
--   (SELECT count(*) FROM public.app_company_memberships WHERE role='owner' AND status='active') AS owner_memberships;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (ver sql/041b-pb-ce-company-core-rollback.sql)
-- ═════════════════════════════════════════════════════════════════════════════
