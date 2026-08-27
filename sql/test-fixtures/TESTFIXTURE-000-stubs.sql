-- =============================================================================
-- ####  T E S T   F I X T U R E  —  N O T   P R O D U C T I O N   S Q L  ####
-- =============================================================================
--
--   ######################################################################
--   #                                                                    #
--   #   DO NOT RUN THIS FILE AGAINST SUPABASE, STAGING OR PRODUCTION.    #
--   #                                                                    #
--   #   Every object below ALREADY EXISTS in the real database with a    #
--   #   different, far richer definition. This file exists ONLY so that  #
--   #   sql/004-marketplace-schema.sql and sql/005-revenue-events.sql    #
--   #   can be executed against a THROWAWAY LOCAL PostgreSQL in order to #
--   #   test them before the operator applies them for real.             #
--   #                                                                    #
--   ######################################################################
--
-- PURPOSE:
-- A bare local PostgreSQL has no `auth` schema, no Supabase roles and none of
-- the pre-existing application tables that 004 and 005 reference by foreign
-- key. Without these stubs the migrations cannot even parse to completion, so
-- there would be no way to test them and every claim about their behaviour
-- would be an unverified promise.
--
-- DELIBERATELY MINIMAL:
-- Only the columns 004/005 actually touch are declared. A faithful replica of
-- the production tables would be a second source of truth that drifts in
-- silence; a stub that is obviously a stub cannot be mistaken for one.
--
-- SEE ALSO: sql/test-fixtures/README-TEST-FIXTURES.md
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Extensions the migrations rely on
-- -----------------------------------------------------------------------------
-- gen_random_uuid() is built in from PG13, but pgcrypto is harmless and keeps
-- the fixture working on older local builds.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- -----------------------------------------------------------------------------
-- 1. Supabase roles
-- -----------------------------------------------------------------------------
-- Supabase ships anon / authenticated / service_role. GRANT and CREATE POLICY
-- statements in 004 and 005 name them explicitly, so they must exist locally or
-- the migrations abort. NOLOGIN + NOINHERIT mirrors the Supabase setup closely
-- enough for privilege testing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. auth schema — stub
-- -----------------------------------------------------------------------------
-- auth.users is the FK target for app_marketplace_instructors.user_id,
-- app_marketplace_course_reviews.reviewer_id, app_academy_courses.verified_by,
-- app_orders.referring_user_id and app_invoices.user_id.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT
);

-- auth.uid() is called inside the RLS policies of 003/004/005. The real
-- implementation reads the request JWT; the stub reads a GUC so a test can
-- impersonate a user with `SET LOCAL request.jwt.claim.sub = '<uuid>'`.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. app_14da0f1941_profiles — stub (LEGACY table, read by app_is_admin())
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_14da0f1941_profiles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role    TEXT
);


-- -----------------------------------------------------------------------------
-- 4. app_academy_courses — stub (004 section 3 adds 8 columns to it)
-- -----------------------------------------------------------------------------
-- Only the pre-existing shape is declared here. Everything 004 adds must be
-- added BY 004, otherwise the test would not be testing the migration.
CREATE TABLE IF NOT EXISTS app_academy_courses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 5. app_orders / app_invoices — stubs matching sql/003-stripe-payments-schema.sql
-- -----------------------------------------------------------------------------
-- These reproduce the APPLIED 003 definitions for the columns 005 touches.
-- app_invoices.reverse_charge in particular is `BOOLEAN NOT NULL DEFAULT false`
-- in 003, which is the fact the new CHECK constraint in 005 depends on.
CREATE TABLE IF NOT EXISTS app_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INT,
  currency     TEXT NOT NULL DEFAULT 'EUR',
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mirrors 003 section 6 exactly for the relevant columns.
CREATE TABLE IF NOT EXISTS app_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_invoice_id  TEXT UNIQUE,
  invoice_number     TEXT,
  invoice_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_country   TEXT,
  supplier_vat_id    TEXT,
  amount_cents       INT NOT NULL,
  vat_cents          INT NOT NULL DEFAULT 0,
  vat_rate           NUMERIC(5,2) NOT NULL DEFAULT 0,
  reverse_charge     BOOLEAN NOT NULL DEFAULT false,
  currency           TEXT NOT NULL DEFAULT 'EUR',
  pdf_url            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 003 also creates app_is_admin(); 004 re-creates it with CREATE OR REPLACE.
-- Declared here so the fixture alone is enough to run 005 standalone too.
CREATE OR REPLACE FUNCTION app_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app_14da0f1941_profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
  );
$$;
