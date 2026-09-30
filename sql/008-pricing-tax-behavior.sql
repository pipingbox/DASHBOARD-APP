-- =============================================================================
-- PB-MARKET-PRICING-001: net-price semantics + catalog as single price source
-- =============================================================================
--
-- PURPOSE (DEC-67, PO LOCKED 2026-09-23):
--   The canonical commercial reference of every product is its NET price.
--   The tax engine (DEC-69: TaxProvider adapter -> Stripe Tax) ADDS the
--   indirect tax on top at determination time. The frontend must show the
--   final B2C total (incl. tax) before purchase once T6 is live; until then,
--   surfaces that show a price must label it as excluding VAT.
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds `tax_behavior` to app_stripe_prices. Canonical value:
--      'exclusive' (amount_cents is NET). 'inclusive' exists only because
--      Stripe price objects can be created that way; nothing may seed it.
--   2. Adds the two B2B marketing plan rows and the PRL intermediate row that
--      the frontend currently renders as hardcoded literals, so that EVERY
--      price a user can see resolves to one catalog row.
--      (b2b_professional_monthly, b2b_enterprise_monthly, prl_course_intermedio)
--      All inserted is_active = false — no sellable price, nothing changes
--      operationally.
--
-- SINGLE SOURCE OF TRUTH (documented one-way flow):
--   app_stripe_prices.amount_cents  ->  canonical NET price
--   app_academy_courses.price_eur   ->  DISPLAY CACHE ONLY (mirrors the
--   catalog for course listing convenience; the frontend resolves with
--   catalog priority via src/lib/academy/pricing.ts). Never the reverse.
--
-- IDEMPOTENT: YES (add column if not exists, guarded constraint, ON CONFLICT
-- DO NOTHING seeds). Safe to re-run.
--
-- STATUS: NOT APPLIED. It must be applied to Supabase by the operator.
-- =============================================================================


-- =============================================================================
-- 1. tax_behavior on the price catalog
-- =============================================================================

ALTER TABLE app_stripe_prices
  ADD COLUMN IF NOT EXISTS tax_behavior TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_stripe_prices_tax_behavior_chk'
  ) THEN
    ALTER TABLE app_stripe_prices
      ADD CONSTRAINT app_stripe_prices_tax_behavior_chk
      CHECK (tax_behavior IN ('inclusive', 'exclusive'));
  END IF;
END $$;

-- Existing catalog rows: all amounts were authored as net prices (the
-- 003 seed amounts equal the commercial prices shown today). Stamp them.
UPDATE app_stripe_prices
  SET tax_behavior = 'exclusive'
  WHERE tax_behavior IS NULL;

-- Make the semantics explicit and enforced going forward: a price without an
-- explicit behavior is an ambiguous price, and ambiguous prices are how the
-- net/gross confusion of finding B7 happened. Default only applies to new
-- rows via the column default below.
ALTER TABLE app_stripe_prices
  ALTER COLUMN tax_behavior SET DEFAULT 'exclusive';

ALTER TABLE app_stripe_prices
  ALTER COLUMN tax_behavior SET NOT NULL;

COMMENT ON COLUMN app_stripe_prices.tax_behavior IS
  'PB-MARKET-PRICING-001 / DEC-67: canonical value is exclusive — amount_cents is the NET commercial price; the tax provider adds indirect tax on top. inclusive exists only to represent legacy Stripe price objects; nothing may seed it.';

COMMENT ON COLUMN app_stripe_prices.amount_cents IS
  'NET commercial price in cents (see tax_behavior). The B2C total incl. tax is computed by the tax engine at determination time, never stored here.';


-- =============================================================================
-- 2. Missing catalog rows for prices currently hardcoded in the frontend
-- =============================================================================

INSERT INTO app_stripe_prices (product_key, amount_cents, currency, billing_type, "interval", is_active, tax_behavior)
VALUES
  -- PricingPage.tsx 'Professional' plan (marketing 299/month)
  ('b2b_professional_monthly', 29900, 'EUR', 'recurring', 'month', false, 'exclusive'),
  -- PricingPage.tsx 'Enterprise' plan (marketing 799/month)
  ('b2b_enterprise_monthly',   79900, 'EUR', 'recurring', 'month', false, 'exclusive'),
  -- PRLCourseContent.tsx 'Intermedio' variant (marketing 89.90)
  ('prl_course_intermedio',     8990, 'EUR', 'one_time',  NULL,   false, 'exclusive')
ON CONFLICT (product_key) DO NOTHING;


-- =============================================================================
-- 3. VERIFICATION (operator, after applying)
-- =============================================================================

--   SELECT product_key, amount_cents, tax_behavior, is_active
--   FROM app_stripe_prices ORDER BY product_key;
--   EXPECT: 16 rows, tax_behavior = 'exclusive' everywhere, is_active = false
--   everywhere (no sellable price until the PO activates monetization).
--
--   SELECT count(*) FROM app_stripe_prices WHERE tax_behavior IS NULL;
--   EXPECT: 0.
