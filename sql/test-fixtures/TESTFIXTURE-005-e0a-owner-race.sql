-- =============================================================================
-- ####  T E S T   F I X T U R E  —  N O T   P R O D U C T I O N   S Q L  ####
-- =============================================================================
--
--   ######################################################################
--   #   DO NOT RUN THIS FILE AGAINST SUPABASE, STAGING OR PRODUCTION.    #
--   ######################################################################
--
-- PURPOSE:
-- Seed helper for the PB-ENT-E0A-COMPANY-CORE-CONCURRENCY-001 harness.
-- Creates a company with N owners (and optionally extra members) so the
-- concurrency driver can exercise the last-owner invariant under real
-- two-session interleavings against sql/058 + sql/059.
--
-- The companion driver is TESTFIXTURE-run-e0a-owner-race.sh; both the
-- "before" (058 only) and "after" (058 + 059) runs call these helpers, so
-- the two runs are provably the same test.
-- =============================================================================

-- Seed: one company (status 'active') with p_nowners owners.
-- Returns the company_id. Membership ids are retrievable via
-- testfixture_e0a_owner_membership(company_id, ordinal).
CREATE OR REPLACE FUNCTION testfixture_e0a_seed_company(p_name text, p_nowners int)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company_id uuid;
  v_user uuid;
  i int;
BEGIN
  -- Creator user + profile (created_by FK).
  INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO v_user;
  INSERT INTO public.app_14da0f1941_profiles (user_id, full_name)
  VALUES (v_user, 'E0A creator ' || p_name);

  INSERT INTO public.app_companies (name, created_by, status, verification_status)
  VALUES (p_name, v_user, 'active', 'unverified')
  RETURNING id INTO v_company_id;

  FOR i IN 1..p_nowners LOOP
    INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO v_user;
    INSERT INTO public.app_14da0f1941_profiles (user_id, full_name)
    VALUES (v_user, 'E0A owner' || i || ' ' || p_name);
    INSERT INTO public.app_company_memberships (company_id, user_id, role, status, invited_by)
    VALUES (v_company_id, v_user, 'owner', 'active', NULL);
  END LOOP;

  RETURN v_company_id;
END $$;

-- Membership id of the n-th owner (by created_at) of a company.
CREATE OR REPLACE FUNCTION testfixture_e0a_owner_membership(p_company_id uuid, p_ordinal int)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT m.id
  FROM public.app_company_memberships m
  WHERE m.company_id = p_company_id AND m.role = 'owner' AND m.status = 'active'
  ORDER BY m.created_at ASC, m.id ASC
  OFFSET (p_ordinal - 1) LIMIT 1;
$$;

-- user_id of a membership (to impersonate the actor via the GUC).
CREATE OR REPLACE FUNCTION testfixture_e0a_membership_user(p_membership_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT m.user_id FROM public.app_company_memberships m WHERE m.id = p_membership_id;
$$;

-- Count of active owners of a company (the invariant under test).
CREATE OR REPLACE FUNCTION testfixture_e0a_owner_count(p_company_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT count(*)::int FROM public.app_company_memberships m
  WHERE m.company_id = p_company_id AND m.role = 'owner' AND m.status = 'active';
$$;

-- Seed: one company (status 'active') with exactly 1 owner plus members with
-- the given non-owner roles. This is the CANONICAL transfer scenario per the
-- sql/058 contract (target = active non-owner): PO review of PR #98 requires
-- the transfer<->remove race to be tested with a non-owner target (C1).
-- Returns the company_id.
CREATE OR REPLACE FUNCTION testfixture_e0a_seed_company_mixed(p_name text, p_extra_roles text[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company_id uuid;
  v_user uuid;
  r text;
BEGIN
  INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO v_user;
  INSERT INTO public.app_14da0f1941_profiles (user_id, full_name)
  VALUES (v_user, 'E0A creator ' || p_name);

  INSERT INTO public.app_companies (name, created_by, status, verification_status)
  VALUES (p_name, v_user, 'active', 'unverified')
  RETURNING id INTO v_company_id;

  -- exactly one owner
  INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO v_user;
  INSERT INTO public.app_14da0f1941_profiles (user_id, full_name)
  VALUES (v_user, 'E0A owner ' || p_name);
  INSERT INTO public.app_company_memberships (company_id, user_id, role, status, invited_by)
  VALUES (v_company_id, v_user, 'owner', 'active', NULL);

  FOREACH r IN ARRAY p_extra_roles LOOP
    INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO v_user;
    INSERT INTO public.app_14da0f1941_profiles (user_id, full_name)
    VALUES (v_user, 'E0A ' || r || ' ' || p_name);
    INSERT INTO public.app_company_memberships (company_id, user_id, role, status, invited_by)
    VALUES (v_company_id, v_user, r, 'active', NULL);
  END LOOP;

  RETURN v_company_id;
END $$;

-- Membership id of the n-th ACTIVE member with a given role of a company.
CREATE OR REPLACE FUNCTION testfixture_e0a_role_membership(p_company_id uuid, p_role text, p_ordinal int)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT m.id
  FROM public.app_company_memberships m
  WHERE m.company_id = p_company_id AND m.role = p_role AND m.status = 'active'
  ORDER BY m.created_at ASC, m.id ASC
  OFFSET (p_ordinal - 1) LIMIT 1;
$$;

-- Snapshot of the final state of the two memberships involved in a race test,
-- as 'role/status|role/status', for explicit post-state assertions (PO: "no
-- basta con comprobar solo ausencia de deadlock").
CREATE OR REPLACE FUNCTION testfixture_e0a_membership_state(p_membership_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT m.role || '/' || m.status FROM public.app_company_memberships m WHERE m.id = p_membership_id;
$$;

-- Adds one extra ACTIVE member with the given role to an existing company and
-- returns the membership id (needed by C3: owner A + owner C + admin B).
CREATE OR REPLACE FUNCTION testfixture_e0a_add_member(p_company_id uuid, p_role text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid;
  v_id uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO v_user;
  INSERT INTO public.app_14da0f1941_profiles (user_id, full_name)
  VALUES (v_user, 'E0A extra ' || p_role);
  INSERT INTO public.app_company_memberships (company_id, user_id, role, status, invited_by)
  VALUES (p_company_id, v_user, p_role, 'active', NULL)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Creates a standalone authenticated user WITHOUT any membership (outsider
-- for the F6 auth-bypass test) and returns its auth.users id.
CREATE OR REPLACE FUNCTION testfixture_e0a_seed_outsider()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO v_user;
  INSERT INTO public.app_14da0f1941_profiles (user_id, full_name)
  VALUES (v_user, 'E0A outsider');
  RETURN v_user;
END $$;
