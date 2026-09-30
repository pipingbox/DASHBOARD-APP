-- =============================================================================
-- PB-CORP-LEGAL-ENTITY-001: LegalEntity abstraction — seller of record
-- =============================================================================
--
-- PURPOSE:
-- Decisions DEC-64/DEC-67 (2026-09-23, PO LOCKED): the brand (PIPINGBOX) is
-- constant, but the LEGAL SELLER changes across phases:
--
--   Phase 1: BE_SOLE_PROPRIETOR — Gaspar Del Hierro Mata, Belgian sole
--            proprietor (Belgium-first, supersedes the Estonia-first ordering
--            of DEC-50/DEC-53 in its timing only).
--   Phase 2: PIPINGBOX_OU_EE — Estonian OÜ, activated on cut-over when the
--            traction trigger (~>= EUR 1,000/month recurring) and the real
--            Management Board structure are validated.
--
-- Today the seller identity is hardcoded in exactly one place:
-- app_invoices.supplier_name DEFAULT 'PIPINGBOX OU' — an entity that does NOT
-- exist and whose public mention is barred by corporate directive. This
-- migration removes that default and gives every transaction a permanent link
-- to the LegalEntity that actually performed it.
--
-- HARD RULE (PO, 2026-09-23): NO INVENTED FISCAL DATA. enterprise_number,
-- vat_number, registered_address, OSS registrations and bank accounts stay
-- NULL until the PO confirms the real values. The two seeded rows carry ONLY
-- identity that already exists (a natural person's name; a future company's
-- reserved trading name). Neither row is active: activation happens when the
-- PO loads the real fiscal data.
--
-- SCOPE:
--   1. CREATE TABLE app_legal_entities (+RLS, single-active-seller index).
--   2. Seed the two phase entities (is_active = false, no fiscal data).
--   3. ALTER TABLE app_invoices ALTER COLUMN supplier_name DROP DEFAULT
--      (the webhook resolves the supplier from the active LegalEntity; brand
--      fallback "PIPINGBOX", never a fake legal person).
--   4. Add nullable legal_entity_id to app_orders, app_invoices and
--      app_marketplace_revenue_events (guarded — the latter only exists once
--      005 is applied). No backfill: there are no live transactions, and
--      historical rows must stay linked to whatever entity really made them
--      (none did).
--
-- IDEMPOTENT:
--   YES — create table if not exists, add column if not exists, drop policy if
--   exists before every create policy, ON CONFLICT DO NOTHING seeds. Safe to
--   re-run. ALTER ... DROP DEFAULT is idempotent by nature.
--
-- STATUS: NOT APPLIED. It must be applied to Supabase by the operator.
-- Verify with scripts/verify-sql-state.md conventions (see PB-OPS-SQLSTATE-001).
-- =============================================================================


-- =============================================================================
-- 1. TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_legal_entities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable machine key (never displayed): BE_SOLE_PROPRIETOR / PIPINGBOX_OU_EE
  entity_key          TEXT UNIQUE NOT NULL,
  -- The real legal name of the seller of record. Phase 1: a natural person.
  -- Phase 2: the incorporated company. NEVER a placeholder like 'PIPINGBOX OU'.
  legal_name          TEXT NOT NULL,
  -- Public trading name. The brand is constant across phases (DEC-67).
  trading_name        TEXT NOT NULL DEFAULT 'PIPINGBOX',
  -- ISO 3166-1 alpha-2 of incorporation/residence.
  jurisdiction        TEXT NOT NULL,
  -- 'sole_proprietor' | 'private_limited_company' (extensible).
  legal_form          TEXT NOT NULL,
  -- REAL DATA ONLY. NULL until the PO confirms the actual number.
  enterprise_number   TEXT,
  vat_number          TEXT,
  registered_address  TEXT,
  -- Invoice issuance configuration.
  invoice_issuer      BOOLEAN NOT NULL DEFAULT false,
  invoice_prefix      TEXT,
  -- Tax registrations as data (OSS state of identification, registration
  -- numbers, thresholds...) so the tax engine can stay code-stable (DEC-68).
  tax_registrations   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Payment/bank references as data; the payout rail stays swappable (DEC-66).
  bank_accounts       JSONB NOT NULL DEFAULT '[]'::jsonb,
  stripe_account_id   TEXT,
  -- Contract/version evidence anchors (PB-MARKET-CONSENT-001 will consume).
  terms_version       TEXT,
  privacy_controller  BOOLEAN NOT NULL DEFAULT false,
  -- Validity window. Rows may be created before they become effective.
  effective_from      TIMESTAMPTZ,
  effective_until     TIMESTAMPTZ,
  -- Exactly ONE entity may be the active seller of record at a time
  -- (enforced by the partial unique index below).
  is_active           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT app_legal_entities_legal_form_chk CHECK (
    legal_form IN ('sole_proprietor', 'private_limited_company')
  ),
  CONSTRAINT app_legal_entities_active_window_chk CHECK (
    -- An active entity must have started and not ended its validity window.
    (is_active = false) OR (
      (effective_from IS NULL OR effective_from <= now()) AND
      (effective_until IS NULL OR effective_until > now())
    )
  )
);

-- Single active seller of record. Two actives would make invoice attribution
-- ambiguous — the exact ambiguity this migration exists to remove.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_legal_entities_single_active
  ON app_legal_entities (is_active) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_app_legal_entities_key ON app_legal_entities (entity_key);

COMMENT ON TABLE app_legal_entities IS
  'PB-CORP-LEGAL-ENTITY-001: seller-of-record registry. The brand is constant; the legal seller is data. Every order/invoice/revenue event links permanently to the entity that performed it. NO INVENTED FISCAL DATA — numbers stay NULL until confirmed by the PO.';


-- =============================================================================
-- 2. RLS
-- =============================================================================

ALTER TABLE app_legal_entities ENABLE ROW LEVEL SECURITY;

-- Public read: the legal notice / impressum must be reachable anonymously.
-- Only identity fields are meaningful until activation; nothing sensitive is
-- stored here (bank/stripe refs are admin-visible only via the write policy).
DROP POLICY IF EXISTS legal_entities_public_read ON app_legal_entities;
CREATE POLICY legal_entities_public_read ON app_legal_entities
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS legal_entities_admin_write ON app_legal_entities;
CREATE POLICY legal_entities_admin_write ON app_legal_entities
  FOR ALL TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());


-- =============================================================================
-- 3. SEED — phase entities, identity only, NO fiscal data
-- =============================================================================

INSERT INTO app_legal_entities (
  entity_key, legal_name, trading_name, jurisdiction, legal_form,
  invoice_issuer, is_active
) VALUES
  (
    'BE_SOLE_PROPRIETOR',
    'Gaspar Del Hierro Mata',
    'PIPINGBOX',
    'BE',
    'sole_proprietor',
    false,
    false
  ),
  (
    'PIPINGBOX_OU_EE',
    'PIPINGBOX OÜ',
    'PIPINGBOX',
    'EE',
    'private_limited_company',
    false,
    false
  )
ON CONFLICT (entity_key) DO NOTHING;

-- Both rows are INACTIVE on purpose. Activation of BE_SOLE_PROPRIETOR happens
-- when the PO loads the real Belgian enterprise/VAT numbers and confirms the
-- start of monetization. PIPINGBOX_OU_EE activates only at the BE->EE cut-over
-- (DEC-64 trigger), never before incorporation.


-- =============================================================================
-- 4. KILL THE HARDCODED SUPPLIER
-- =============================================================================

-- 003 shipped `supplier_name TEXT NOT NULL DEFAULT 'PIPINGBOX OU'` — an
-- entity that does not exist. The webhook must resolve the supplier from the
-- active LegalEntity instead (falling back to the brand 'PIPINGBOX', never a
-- fake legal person). Dropping the default makes the schema stop asserting a
-- legal identity nobody chose.
ALTER TABLE app_invoices ALTER COLUMN supplier_name DROP DEFAULT;


-- =============================================================================
-- 5. PERMANENT TRANSACTION LINKS (nullable, no backfill)
-- =============================================================================

ALTER TABLE app_orders
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES app_legal_entities(id);

ALTER TABLE app_invoices
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES app_legal_entities(id);

CREATE INDEX IF NOT EXISTS idx_app_orders_legal_entity ON app_orders (legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_app_invoices_legal_entity ON app_invoices (legal_entity_id);

-- app_marketplace_revenue_events exists only after 005. Guard so this file is
-- safe on databases where 005 has not run yet (fresh environments).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_marketplace_revenue_events'
  ) THEN
    ALTER TABLE app_marketplace_revenue_events
      ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES app_legal_entities(id);
    CREATE INDEX IF NOT EXISTS idx_app_mre_legal_entity
      ON app_marketplace_revenue_events (legal_entity_id);
  END IF;
END $$;

-- No backfill: there are no live transactions (Stripe test mode, all catalog
-- prices inactive). Historical rows keep legal_entity_id NULL, which is the
-- truthful statement "no legal entity performed this (test) transaction".


-- =============================================================================
-- 6. VERIFICATION (operator, after applying)
-- =============================================================================

--   SELECT entity_key, legal_name, jurisdiction, is_active,
--          enterprise_number, vat_number
--   FROM app_legal_entities ORDER BY entity_key;
--   EXPECT: 2 rows, both is_active = false, both fiscal fields NULL.
--
--   SELECT column_default FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='app_invoices'
--     AND column_name='supplier_name';
--   EXPECT: NULL (default gone).
--
--   SELECT count(*) FROM pg_indexes
--   WHERE schemaname='public' AND indexname='idx_app_legal_entities_single_active';
--   EXPECT: 1.
