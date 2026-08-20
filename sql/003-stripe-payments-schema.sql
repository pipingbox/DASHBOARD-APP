-- =============================================================================
-- PB-STRIPE-001 Fase 2: Stripe payments schema
-- =============================================================================
--
-- PURPOSE:
-- Create the persistence layer for all PipingBox monetization: one-time orders
-- (courses, exam booking fees, job credits), recurring subscriptions (Premium
-- Tools, Enterprise), webhook idempotency, and EU-compliant invoices.
--
-- Reference: brain/10-CORPORATE/STRIPE_INTEGRATION_SPEC.md v1.0, sections 3-7.
-- Ticket:    brain/06-EXECUTION/TICKETS/EXECUTING/PB-STRIPE-001.md
--
-- SCOPE:
-- Creates 5 new tables. Touches one existing table, app_14da0f1941_profiles,
-- in two ways: (a) ADD COLUMN IF NOT EXISTS for is_premium_tools and
-- premium_expires_at (section 8.2), (b) a trigger that writes those two
-- columns when a subscription changes state. No existing column is altered
-- or dropped.
--
-- SECURITY MODEL:
-- Clients never write. Every table below is writable by service_role only
-- (i.e. the Edge Functions create-checkout and stripe-webhook). Authenticated
-- users get SELECT on their own rows and nothing else. This is stricter than
-- SPEC 4.1 ("owner insert") on purpose: SPEC 6.2 requires that all access
-- grants happen in the webhook and never in the client, and an insertable
-- app_orders would let a browser fabricate a pending order for any product.
--
-- TEST MODE:
-- Safe to run before PIPINGBOX OU exists. stripe_price_id is seeded as NULL
-- and filled in once the Stripe test-mode products are created (Fase 1).
--
-- REVERSIBLE:
-- YES — run the ROLLBACK section at the bottom to undo everything.
--
-- STATUS: APPLIED 2026-08-01 to project mwdauubztjxkbrefirbg (migrations
-- `stripe_payments_schema` + `stripe_touch_updated_at_search_path`).
-- Verified: 5 tables with rowsecurity = true, 13 seed rows, all inactive.
-- =============================================================================


-- =============================================================================
-- 1. Admin helper
-- =============================================================================
-- SECURITY DEFINER so that reading the profiles table from inside a policy on
-- another table does not re-enter that table's own RLS.

CREATE OR REPLACE FUNCTION app_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app_14da0f1941_profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
  );
$$;


-- =============================================================================
-- 2. app_stripe_prices — price catalog (SPEC 3.2)
-- =============================================================================
-- Stripe price IDs live here, not in the code, so they can be rotated (and
-- swapped test -> live) without a redeploy.

CREATE TABLE IF NOT EXISTS app_stripe_prices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key      TEXT NOT NULL UNIQUE,
  stripe_price_id  TEXT,                     -- NULL until the product exists in Stripe
  amount_cents     INT,                      -- NULL for negotiated (enterprise)
  currency         TEXT NOT NULL DEFAULT 'EUR',
  billing_type     TEXT NOT NULL CHECK (billing_type IN ('recurring', 'one_time')),
  -- "interval" is a Postgres col_name_keyword: legal as a column name, but it
  -- must be quoted inside expressions or the parser reads it as the start of an
  -- interval literal. The spec (3.2) names the column `interval`, so the name is
  -- kept and quoted wherever it appears in an expression.
  "interval"       TEXT CHECK ("interval" IN ('month', 'year')),
  is_active        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- recurring needs an interval; one_time must not have one
  CONSTRAINT app_stripe_prices_interval_coherent CHECK (
    (billing_type = 'recurring' AND "interval" IS NOT NULL) OR
    (billing_type = 'one_time'  AND "interval" IS NULL)
  ),
  -- a price cannot be sellable until it is mapped to Stripe
  CONSTRAINT app_stripe_prices_active_needs_stripe_id CHECK (
    is_active = false OR stripe_price_id IS NOT NULL
  )
);


-- =============================================================================
-- 3. app_orders — one-time purchases (SPEC 4.1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_orders (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_key                 TEXT NOT NULL,
  stripe_price_id             TEXT,
  stripe_checkout_session_id  TEXT,
  stripe_payment_intent_id    TEXT,
  amount_cents                INT NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'EUR',
  status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at                     TIMESTAMPTZ,
  refunded_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_orders_user      ON app_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_app_orders_status    ON app_orders(status);
CREATE INDEX IF NOT EXISTS idx_app_orders_product   ON app_orders(product_key);

-- One order row per line item per checkout session (SPEC 5.3 combined checkout
-- creates several rows sharing one session id, so the pair must be unique, not
-- the session id alone).
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_orders_session_product
  ON app_orders(stripe_checkout_session_id, product_key)
  WHERE stripe_checkout_session_id IS NOT NULL;


-- =============================================================================
-- 4. app_subscriptions — recurring (SPEC 4.2)
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_key             TEXT NOT NULL,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT UNIQUE,
  status                  TEXT NOT NULL DEFAULT 'trialing'
                            CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_subscriptions_user     ON app_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_subscriptions_status   ON app_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_app_subscriptions_customer ON app_subscriptions(stripe_customer_id);


-- =============================================================================
-- 5. app_stripe_events — webhook idempotency log (SPEC 6.3)
-- =============================================================================
-- The webhook handler MUST insert here first and abort on conflict. Stripe
-- retries deliveries; without this a retry would grant access twice.

CREATE TABLE IF NOT EXISTS app_stripe_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  TEXT NOT NULL UNIQUE,
  event_type       TEXT NOT NULL,
  processed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_app_stripe_events_type ON app_stripe_events(event_type);


-- =============================================================================
-- 6. app_invoices — EU-compliant invoice records (SPEC 7.3)
-- =============================================================================
-- supplier_vat_id stays nullable until PIPINGBOX OU is incorporated; in test
-- mode there is no VAT number to write.

CREATE TABLE IF NOT EXISTS app_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_invoice_id  TEXT UNIQUE,
  invoice_number     TEXT,
  invoice_date       DATE,
  customer_name      TEXT,
  customer_vat_id    TEXT,                   -- B2B only
  customer_country   TEXT,                   -- ISO 3166-1 alpha-2
  supplier_name      TEXT NOT NULL DEFAULT 'PIPINGBOX OU',
  supplier_vat_id    TEXT,                   -- NULL until incorporation
  amount_cents       INT NOT NULL,
  vat_cents          INT NOT NULL DEFAULT 0,
  vat_rate           NUMERIC(5,2) NOT NULL DEFAULT 0,
  reverse_charge     BOOLEAN NOT NULL DEFAULT false,
  currency           TEXT NOT NULL DEFAULT 'EUR',
  pdf_url            TEXT,                   -- Stripe-hosted
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_invoices_user ON app_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_app_invoices_date ON app_invoices(invoice_date);


-- =============================================================================
-- 7. Row Level Security
-- =============================================================================
-- Pattern: authenticated users SELECT their own rows. Nobody but service_role
-- writes. service_role bypasses RLS entirely, so it needs no policy.

ALTER TABLE app_stripe_prices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_stripe_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_invoices       ENABLE ROW LEVEL SECURITY;

-- 7.1 Prices — public read (prices are public information), admin write.
CREATE POLICY "stripe_prices_public_read" ON app_stripe_prices
  FOR SELECT USING (true);

CREATE POLICY "stripe_prices_admin_write" ON app_stripe_prices
  FOR ALL TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

-- 7.2 Orders — owner read, admin read. No client write.
CREATE POLICY "orders_owner_read" ON app_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_is_admin());

-- 7.3 Subscriptions — owner read, admin read. No client write.
CREATE POLICY "subscriptions_owner_read" ON app_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_is_admin());

-- 7.4 Invoices — owner read, admin read. No client write.
CREATE POLICY "invoices_owner_read" ON app_invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_is_admin());

-- 7.5 Events — admin read only. This table holds raw Stripe payloads.
CREATE POLICY "stripe_events_admin_read" ON app_stripe_events
  FOR SELECT TO authenticated
  USING (app_is_admin());


-- =============================================================================
-- 8. Triggers
-- =============================================================================

-- 8.1 updated_at maintenance
CREATE OR REPLACE FUNCTION app_stripe_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_stripe_prices_updated ON app_stripe_prices;
CREATE TRIGGER trg_app_stripe_prices_updated
  BEFORE UPDATE ON app_stripe_prices
  FOR EACH ROW EXECUTE FUNCTION app_stripe_touch_updated_at();

DROP TRIGGER IF EXISTS trg_app_orders_updated ON app_orders;
CREATE TRIGGER trg_app_orders_updated
  BEFORE UPDATE ON app_orders
  FOR EACH ROW EXECUTE FUNCTION app_stripe_touch_updated_at();

DROP TRIGGER IF EXISTS trg_app_subscriptions_updated ON app_subscriptions;
CREATE TRIGGER trg_app_subscriptions_updated
  BEFORE UPDATE ON app_subscriptions
  FOR EACH ROW EXECUTE FUNCTION app_stripe_touch_updated_at();


-- 8.2 Sync premium flags into profiles (SPEC 4.3)
-- premium.ts:72 reads profiles.is_premium_tools and .premium_expires_at.
-- Keeping the write here (DB-side) means the grant cannot be forged from the
-- browser: only the webhook, running as service_role, can move a subscription
-- into 'active', and only that transition flips the flag.

-- Guard: premium.ts already SELECTs these two columns, but the select sits
-- inside a try/catch that silently returns "not premium" if they are missing,
-- so their absence would be invisible in the UI and would only surface as a
-- trigger failure at payment time. Created here if absent — idempotent.
ALTER TABLE app_14da0f1941_profiles
  ADD COLUMN IF NOT EXISTS is_premium_tools BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_14da0f1941_profiles
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION app_sync_premium_from_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only Premium Tools products drive the tools premium flag. Enterprise
  -- subscriptions grant premium through the company, handled separately.
  IF NEW.product_key NOT LIKE 'premium_tools%' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'active' THEN
    UPDATE app_14da0f1941_profiles
       SET is_premium_tools  = true,
           premium_expires_at = NEW.current_period_end,
           updated_at         = now()
     WHERE user_id = NEW.user_id;

  ELSIF NEW.status IN ('canceled', 'past_due') THEN
    -- Revoke only if no other premium_tools subscription is still active.
    IF NOT EXISTS (
      SELECT 1 FROM app_subscriptions s
       WHERE s.user_id = NEW.user_id
         AND s.id <> NEW.id
         AND s.product_key LIKE 'premium_tools%'
         AND s.status = 'active'
    ) THEN
      UPDATE app_14da0f1941_profiles
         SET is_premium_tools  = false,
             premium_expires_at = NULL,
             updated_at         = now()
       WHERE user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_sync_premium ON app_subscriptions;
CREATE TRIGGER trg_app_sync_premium
  AFTER INSERT OR UPDATE OF status, current_period_end ON app_subscriptions
  FOR EACH ROW EXECUTE FUNCTION app_sync_premium_from_subscription();


-- =============================================================================
-- 9. Seed — product catalog (SPEC 3.1)
-- =============================================================================
-- stripe_price_id is NULL and is_active is false on purpose. Fase 1 (creating
-- the products in the Stripe test dashboard) fills them in with:
--
--   UPDATE app_stripe_prices
--      SET stripe_price_id = 'price_xxx', is_active = true
--    WHERE product_key = 'vca_course_bvca';
--
-- PRICE CORRECTION 2026-08-01: vca_course_volvca is EUR 79.90, not 89.90. The
-- 89.90 figure in an earlier draft of STRIPE_INTEGRATION_SPEC.md §3.1 was a
-- transcription error — it is the price of the VCA + technical course bundle in
-- VCA_COURSE_CONTENT.md, not of VOL-VCA. REVENUE_ENGINE.md Feature 2.2 sets
-- VOL-VCA at 79.90 and models revenue on it. Spec corrected.
--
-- vca_bundle_technical (EUR 89.90) is seeded but intentionally NOT sellable:
-- there is no paid technical course to bundle with yet (Piping Fundamentals is
-- free). It stays is_active = false until the first one ships. The constraint
-- app_stripe_prices_active_needs_stripe_id makes accidental activation
-- impossible while stripe_price_id is NULL.

INSERT INTO app_stripe_prices (product_key, amount_cents, currency, billing_type, "interval", is_active)
VALUES
  ('premium_tools_monthly', 499,   'EUR', 'recurring', 'month', false),
  ('premium_tools_annual',  3900,  'EUR', 'recurring', 'year',  false),
  ('vca_exams_unlimited',   3990,  'EUR', 'one_time',  NULL,    false),
  ('vca_course_bvca',       5990,  'EUR', 'one_time',  NULL,    false),
  ('vca_course_volvca',     7990,  'EUR', 'one_time',  NULL,    false),
  ('vca_bundle_technical',  8990,  'EUR', 'one_time',  NULL,    false),
  ('prl_course_basico',     2990,  'EUR', 'one_time',  NULL,    false),
  ('vca_booking_standard',  1000,  'EUR', 'one_time',  NULL,    false),
  ('vca_booking_urgent',    1500,  'EUR', 'one_time',  NULL,    false),
  ('job_credit_1',          2900,  'EUR', 'one_time',  NULL,    false),
  ('job_credit_5',          12900, 'EUR', 'one_time',  NULL,    false),
  ('job_credit_20',         39900, 'EUR', 'one_time',  NULL,    false),
  ('enterprise_annual',     NULL,  'EUR', 'recurring', 'year',  false)
ON CONFLICT (product_key) DO NOTHING;


-- =============================================================================
-- 10. Verification
-- =============================================================================
-- Run after applying. Expected: 5 tables, all with rowsecurity = true.

-- SELECT tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename IN ('app_stripe_prices','app_orders','app_subscriptions',
--                      'app_stripe_events','app_invoices')
--  ORDER BY tablename;

-- Expected: 13 rows, all with stripe_price_id IS NULL and is_active = false.
-- SELECT product_key, amount_cents, billing_type, "interval", is_active
--   FROM app_stripe_prices ORDER BY product_key;

-- Expected: no policy grants INSERT/UPDATE/DELETE to 'authenticated' on the
-- four write-protected tables (only the admin ALL policy on prices shows up).
-- SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename LIKE 'app_%'
--    AND tablename IN ('app_stripe_prices','app_orders','app_subscriptions',
--                      'app_stripe_events','app_invoices')
--  ORDER BY tablename, policyname;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Drops everything this script created. Destroys all payment records — only
-- safe while in test mode.
--
-- DROP TRIGGER IF EXISTS trg_app_sync_premium ON app_subscriptions;
-- DROP TRIGGER IF EXISTS trg_app_subscriptions_updated ON app_subscriptions;
-- DROP TRIGGER IF EXISTS trg_app_orders_updated ON app_orders;
-- DROP TRIGGER IF EXISTS trg_app_stripe_prices_updated ON app_stripe_prices;
-- DROP FUNCTION IF EXISTS app_sync_premium_from_subscription();
-- DROP FUNCTION IF EXISTS app_stripe_touch_updated_at();
-- DROP TABLE IF EXISTS app_invoices;
-- DROP TABLE IF EXISTS app_stripe_events;
-- DROP TABLE IF EXISTS app_subscriptions;
-- DROP TABLE IF EXISTS app_orders;
-- DROP TABLE IF EXISTS app_stripe_prices;
-- DROP FUNCTION IF EXISTS app_is_admin();
--
-- Premium flags written by the sync trigger are NOT reverted automatically:
-- UPDATE app_14da0f1941_profiles
--    SET is_premium_tools = false, premium_expires_at = NULL
--  WHERE is_premium_tools = true;
