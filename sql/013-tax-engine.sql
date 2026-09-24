-- =============================================================================
-- PB-MARKET-TAX-ENGINE-001: tax engine structure (DEC-69, PO LOCKED 2026-09-23)
-- =============================================================================
--
-- PURPOSE:
--   T6 GO (PO 2026-09-23): implement the tax engine STRUCTURALLY.
--
--   Architecture (DEC-69):
--     PIPINGBOX -> "TaxProvider" interface/adapter -> Stripe Tax
--
--   Stripe Tax determines VAT/GST/Sales Tax, jurisdiction and taxability.
--   PIPINGBOX stays source of truth for: LegalEntity, buyer/product
--   classification, orders, invoices, tax RESULTS, tax evidence, financial
--   ledger and audit trail. Stripe Tax is NOT the financial source of truth.
--
--   NON_EU ≠ TAX_FREE. The platform sells globally from day one; the provider
--   determines the applicable regime per its configuration/registrations.
--   Never charge a tax in a jurisdiction whose registration is legally
--   required but does not exist yet (see app_tax_registrations).
--
-- WHAT THIS MIGRATION DOES:
--   1. tax_category + stripe_tax_code on the price catalog (product
--      classification lives on the catalog, the single source of truth).
--   2. app_tax_determinations — APPEND-ONLY per-transaction tax results
--      (provider facts + our classification snapshot).
--   3. app_tax_registrations — registration/threshold status per jurisdiction
--      per LegalEntity, the gate that answers "may we charge tax here?".
--
-- WHAT IT DOES NOT DO:
--   * No live charging. Catalog rows stay is_active = false.
--   * No tax RATES anywhere: rates are determined by the provider at
--     transaction time, never hardcoded.
--   * No fiscal data invented: app_tax_registrations seeds NOTHING; rows are
--     loaded by the PO/operator when real registrations exist.
--
-- IDEMPOTENT: YES. STATUS: NOT APPLIED (operator, PB-OPS-SQLSTATE-001).
-- =============================================================================


-- =============================================================================
-- 1. PRODUCT TAX CLASSIFICATION on the catalog
-- =============================================================================
-- PO (T6): separate at minimum RECORDED_DIGITAL_COURSE, SAAS_TOOLS,
-- PREMIUM_SUBSCRIPTION, RECRUITMENT_SERVICE, B2B_ENTERPRISE_SERVICE,
-- EXAM_PREPARATION, EXAM_INTERMEDIATION. NO single generic tax code.

ALTER TABLE app_stripe_prices
  ADD COLUMN IF NOT EXISTS tax_category TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_stripe_prices_tax_category_chk'
  ) THEN
    ALTER TABLE app_stripe_prices
      ADD CONSTRAINT app_stripe_prices_tax_category_chk
      CHECK (tax_category IN (
        'RECORDED_DIGITAL_COURSE',
        'SAAS_TOOLS',
        'PREMIUM_SUBSCRIPTION',
        'RECRUITMENT_SERVICE',
        'B2B_ENTERPRISE_SERVICE',
        'EXAM_PREPARATION',
        'EXAM_INTERMEDIATION'
      ));
  END IF;
END $$;

-- The provider-side product tax code (Stripe Tax txcd_*, as DATA so the
-- provider stays swappable). NULL until the operator maps the product in the
-- provider; a NULL honestly means "not mapped yet".
ALTER TABLE app_stripe_prices
  ADD COLUMN IF NOT EXISTS stripe_tax_code TEXT;

-- Classify the existing catalog. Every value below is an OBSERVED fact about
-- what the product IS, not a fiscal treatment decision.
UPDATE app_stripe_prices SET tax_category = 'RECORDED_DIGITAL_COURSE'
  WHERE product_key IN ('vca_course_bvca', 'prl_course_intermedio')
    AND tax_category IS NULL;
UPDATE app_stripe_prices SET tax_category = 'PREMIUM_SUBSCRIPTION'
  WHERE product_key IN ('premium_tools_monthly', 'premium_tools_annual')
    AND tax_category IS NULL;
UPDATE app_stripe_prices SET tax_category = 'EXAM_INTERMEDIATION'
  WHERE product_key LIKE 'vca_booking%'
    AND tax_category IS NULL;
UPDATE app_stripe_prices SET tax_category = 'B2B_ENTERPRISE_SERVICE'
  WHERE product_key LIKE 'b2b_%'
    AND tax_category IS NULL;
UPDATE app_stripe_prices SET tax_category = 'RECRUITMENT_SERVICE'
  WHERE product_key LIKE 'job_credit%'
    AND tax_category IS NULL;

COMMENT ON COLUMN app_stripe_prices.tax_category IS
  'PB-MARKET-TAX-ENGINE-001: canonical product tax classification (DEC-69). Determines the provider tax code and the taxability regime. No generic catch-all value exists on purpose.';
COMMENT ON COLUMN app_stripe_prices.stripe_tax_code IS
  'Provider-side tax code (Stripe Tax txcd_*) as data. NULL = not mapped in the provider yet. Kept as data so the TaxProvider adapter stays swappable.';

-- -----------------------------------------------------------------------------
-- STAGING MAPPING (PO GO 2026-09-24, section 3) — real Stripe Tax product
-- tax codes, one per category, NO generic catch-all. Every code below was
-- verified against the authoritative list (docs.stripe.com/tax/tax-codes):
--
--   RECORDED_DIGITAL_COURSE  txcd_10402000
--     "Digital Audio Visual Works - streamed - non subscription - with
--      limited rights" — course video streamed from the platform, access tied
--      to the account (no permanent download). Exactly our delivery form.
--
--   PREMIUM_SUBSCRIPTION     txcd_10103000
--     "Software as a service (SaaS) - personal use" — premium_tools_* are
--     worker-facing (B2C) subscriptions to hosted tools; nothing downloaded.
--
--   SAAS_TOOLS               txcd_10103001
--     "Software as a service (SaaS) - business use" — the same hosted tools
--     sold to companies.
--
--   B2B_ENTERPRISE_SERVICE   txcd_10103001
--     "Software as a service (SaaS) - business use" — b2b_* subscriptions to
--     the platform (professional / enterprise tiers) are B2B SaaS.
--
--   EXAM_PREPARATION         txcd_10402000
--     Recorded prep course = same streamed-video delivery form as
--     RECORDED_DIGITAL_COURSE. (If a prep product ships as downloadable
--     permanent material instead, txcd_10302000 "Digital Books - downloaded -
--     permanent rights" is the candidate — decision deferred to the PO.)
--
--   EXAM_INTERMEDIATION      txcd_20030000
--     "General - Services" — booking/sitting an exam on the buyer's behalf is
--     a human-provided service, not an electronic supply. No exam-specific
--     code exists in the Stripe list.
--
--   RECRUITMENT_SERVICE      txcd_20040006
--     "Employment Services" — services matching employees to employers.
--     job_credit* packs are exactly that.
--
-- DELIBERATELY NOT MAPPED: txcd_10000000 ("General - Electronically Supplied
-- Services") as a blanket code — the PO forbids a single generic tax code.
--
-- These values are STAGING-only until the PO reviews the mapping table; they
-- do not activate any tax regime by themselves (the TaxProvider adapter stays
-- inert until STRIPE_AUTOMATIC_TAX=true AND real registrations exist).
-- -----------------------------------------------------------------------------
UPDATE app_stripe_prices SET stripe_tax_code = 'txcd_10402000'
  WHERE tax_category IN ('RECORDED_DIGITAL_COURSE', 'EXAM_PREPARATION')
    AND stripe_tax_code IS NULL;
UPDATE app_stripe_prices SET stripe_tax_code = 'txcd_10103000'
  WHERE tax_category = 'PREMIUM_SUBSCRIPTION'
    AND stripe_tax_code IS NULL;
UPDATE app_stripe_prices SET stripe_tax_code = 'txcd_10103001'
  WHERE tax_category IN ('SAAS_TOOLS', 'B2B_ENTERPRISE_SERVICE')
    AND stripe_tax_code IS NULL;
UPDATE app_stripe_prices SET stripe_tax_code = 'txcd_20030000'
  WHERE tax_category = 'EXAM_INTERMEDIATION'
    AND stripe_tax_code IS NULL;
UPDATE app_stripe_prices SET stripe_tax_code = 'txcd_20040006'
  WHERE tax_category = 'RECRUITMENT_SERVICE'
    AND stripe_tax_code IS NULL;


-- =============================================================================
-- 2. app_tax_determinations — APPEND-ONLY tax results per transaction
-- =============================================================================
-- One row per determination event. Facts from the provider + our own
-- classification snapshot. Nothing here is derived from other rows.

CREATE TABLE IF NOT EXISTS app_tax_determinations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID REFERENCES app_orders(id) ON DELETE RESTRICT,
  legal_entity_id       UUID REFERENCES app_legal_entities(id) ON DELETE RESTRICT,
  -- Which provider produced this result ('stripe_tax'). As data, so a second
  -- provider is a new value, not a rewrite.
  provider              TEXT NOT NULL,
  -- Provider-side reference (Stripe Tax calculation id, etc.).
  provider_reference    TEXT,
  -- Result facts, as returned by the provider.
  jurisdiction          TEXT,
  tax_type              TEXT,          -- 'vat' | 'gst' | 'sales_tax' | ...
  tax_rate              NUMERIC(7,4),  -- percentage points, provider-reported
  taxable_amount_cents  INT,
  tax_amount_cents      INT,
  currency              TEXT,
  -- Our own classification, snapshotted at determination time (the catalog
  -- row may later be reclassified; the transaction keeps what was true then).
  product_tax_category  TEXT,
  customer_country      TEXT,
  customer_region       TEXT,
  -- B2B/B2C. THREE-STATE: NULL = not determined, never a default "consumer".
  buyer_is_business     BOOLEAN,
  -- VAT/tax id status at determination time ('NOT_PROVIDED' | 'PROVIDED' |
  -- 'VIES_VALIDATED' | provider-specific values). Presence ≠ validation.
  customer_tax_id_status TEXT,
  -- Reverse charge: may only be true on positive evidence (validated B2B
  -- determination). Status recorded alongside, same rule as app_invoices.
  reverse_charge        BOOLEAN NOT NULL DEFAULT false,
  reverse_charge_status TEXT NOT NULL DEFAULT 'UNDETERMINED',
  -- When the determination happened and against which registration set.
  determined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_config_version TEXT,
  evidence              JSONB NOT NULL DEFAULT '{}'::jsonb,
  livemode              BOOLEAN,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT app_tax_determinations_rc_coherent_chk CHECK (
    -- true + undetermined is unrepresentable (same coherence rule as
    -- app_invoices in 005, section 3.1).
    reverse_charge = false OR reverse_charge_status <> 'UNDETERMINED'
  )
);

CREATE INDEX IF NOT EXISTS idx_app_tax_determinations_order
  ON app_tax_determinations (order_id);
CREATE INDEX IF NOT EXISTS idx_app_tax_determinations_jurisdiction
  ON app_tax_determinations (jurisdiction, determined_at);

COMMENT ON TABLE app_tax_determinations IS
  'PB-MARKET-TAX-ENGINE-001 (DEC-69): APPEND-ONLY tax determination results. PIPINGBOX is the source of truth for tax RESULTS; the provider (Stripe Tax) determines them, we persist them with our classification snapshot and evidence. NON_EU is never assumed TAX_FREE — a missing row means "not determined", never "no tax".';


-- =============================================================================
-- 3. app_tax_registrations — may we charge tax in this jurisdiction?
-- =============================================================================
-- The registration gate. The checkout flow must NOT charge a tax in a
-- jurisdiction whose registration is legally required but absent (PO, T6).
-- Threshold monitoring: threshold_amount_cents is the jurisdiction's
-- registration threshold as data; current period sales are computed from the
-- revenue events, and the gap drives alerts (where the provider supports it).

CREATE TABLE IF NOT EXISTS app_tax_registrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id       UUID NOT NULL REFERENCES app_legal_entities(id) ON DELETE RESTRICT,
  -- ISO country (+ optional region/province for e.g. US states, CA provinces).
  jurisdiction_country  TEXT NOT NULL,
  jurisdiction_region   TEXT,
  -- 'NOT_REQUIRED' | 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'DEREGISTERED'
  status                TEXT NOT NULL DEFAULT 'PENDING',
  -- Real registration number. NULL until it exists — NO INVENTED DATA.
  registration_number   TEXT,
  tax_type              TEXT,          -- 'vat' | 'gst' | 'sales_tax' | 'oss'
  -- Registration threshold monitoring (data; the law decides the value).
  threshold_amount_cents BIGINT,
  threshold_currency    TEXT,
  threshold_window      TEXT,          -- e.g. 'rolling_12m' | 'calendar_year'
  effective_from        TIMESTAMPTZ,
  effective_until       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT app_tax_registrations_status_chk CHECK (
    status IN ('NOT_REQUIRED', 'PENDING', 'ACTIVE', 'EXPIRED', 'DEREGISTERED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_tax_registrations_unique
  ON app_tax_registrations (legal_entity_id, jurisdiction_country, COALESCE(jurisdiction_region, ''));
CREATE INDEX IF NOT EXISTS idx_app_tax_registrations_status
  ON app_tax_registrations (status) WHERE status = 'ACTIVE';

COMMENT ON TABLE app_tax_registrations IS
  'PB-MARKET-TAX-ENGINE-001 (DEC-69): tax registration + threshold status per jurisdiction per LegalEntity. Gate for "may we charge this tax here" and input to threshold alerts. Seeded EMPTY: rows are loaded when real registrations exist.';

-- NO SEED. An empty table is the truth today: no registrations exist yet.


-- =============================================================================
-- 4. RLS
-- =============================================================================

ALTER TABLE app_tax_determinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_tax_registrations ENABLE ROW LEVEL SECURITY;

-- Determinations: the buyer reads their own (via the order), admin reads all.
-- Writes come from service_role only (webhook / tax adapter).
DROP POLICY IF EXISTS tax_determinations_admin_read ON app_tax_determinations;
CREATE POLICY tax_determinations_admin_read ON app_tax_determinations
  FOR SELECT TO authenticated
  USING (app_is_admin());

DROP POLICY IF EXISTS tax_determinations_owner_read ON app_tax_determinations;
CREATE POLICY tax_determinations_owner_read ON app_tax_determinations
  FOR SELECT TO authenticated
  USING (
    order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM app_orders o
      WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

-- Registrations: admin only (fiscal posture is not public data).
DROP POLICY IF EXISTS tax_registrations_admin_all ON app_tax_registrations;
CREATE POLICY tax_registrations_admin_all ON app_tax_registrations
  FOR ALL TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

GRANT SELECT ON app_tax_determinations TO authenticated;
GRANT SELECT ON app_tax_registrations TO authenticated;


-- =============================================================================
-- 5. VERIFICATION (operator, after applying)
-- =============================================================================
--
--   SELECT product_key, tax_category, requires_supply_consent
--   FROM app_stripe_prices ORDER BY product_key;
--   EXPECT: every row classified, no NULL tax_category.
--
--   SELECT count(*) FROM app_tax_registrations;
--   EXPECT: 0 (empty on purpose — no registrations exist yet).
