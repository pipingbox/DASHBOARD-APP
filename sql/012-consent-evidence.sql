-- =============================================================================
-- PB-MARKET-CONSENT-001: right-of-withdrawal consent + supply-start evidence
-- =============================================================================
--
-- PURPOSE (PO GO 2026-09-23, T5):
-- Marketplace MVP = RECORDED DIGITAL COURSES. Before immediate access is
-- activated, the buyer must:
--   1. expressly request the immediate supply of the digital content
--      (checkbox NEVER pre-ticked), and
--   2. expressly acknowledge that they lose the legal right of withdrawal
--      once the supply begins, where the applicable regime so provides.
--
-- This migration creates the evidence layer. It deliberately stores FACTS
-- (who consented, to which exact text version, when, from where, and when the
-- supply actually started), never interpretations. The final legal wording
-- may be revised by counsel WITHOUT changing this model: a new wording is a
-- new text_version, and old rows keep pointing at the wording that was
-- actually shown.
--
-- HARD RULES:
--   * NO consumption-percentage refund policy. Course progress may exist as
--     product/analytics data; it never drives the legal right of withdrawal
--     (PO 2026-09-23, section 2).
--   * Both tables are APPEND-ONLY. Corrections are new rows, never edits.
--   * Writes come from service_role only (create-checkout / stripe-webhook).
--     The client can neither mint nor alter evidence.
--   * The client never supplies the consent TEXT. It sends a version key;
--     the server resolves the canonical wording from its own registry and
--     stores the resolved text plus its SHA-256. A forged version key fails
--     closed (unknown version -> 400), it cannot mint evidence.
--
-- IDEMPOTENT: YES (create if not exists, drop policy if exists first).
-- STATUS: NOT APPLIED. Operator applies it (see scripts/verify-sql-state.md
-- conventions, PB-OPS-SQLSTATE-001).
-- =============================================================================


-- =============================================================================
-- 1. app_consent_evidence — one row per consent act
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_consent_evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Linked after payment by the webhook (order rows may not exist yet when
  -- the consent is recorded at checkout-session creation). NULL = "consent
  -- recorded, purchase not completed".
  order_id            UUID REFERENCES app_orders(id) ON DELETE RESTRICT,
  -- The LegalEntity whose terms the buyer accepted. Resolved server-side
  -- from the ACTIVE seller of record at consent time (007). Nullable only
  -- because no entity is active yet; the fact is still recorded.
  legal_entity_id     UUID REFERENCES app_legal_entities(id) ON DELETE RESTRICT,
  -- What was consented to. MVP uses IMMEDIATE_SUPPLY_DIGITAL_CONTENT (the
  -- withdrawal-right acknowledgement). TERMS_ACCEPTANCE exists for the
  -- general T&C tick if/when the checkout gains one.
  consent_type        TEXT NOT NULL,
  -- Server-side registry key of the exact wording shown (e.g. 'v2026-09-23').
  text_version        TEXT NOT NULL,
  -- SHA-256 of the canonical text, computed SERVER-SIDE at write time.
  text_hash           TEXT NOT NULL,
  -- The exact wording shown to the buyer, resolved server-side. Stored so
  -- the evidence does not depend on any registry surviving unchanged.
  text_snapshot       TEXT NOT NULL,
  -- Session/request facts.
  consented_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address          INET,
  user_agent          TEXT,
  -- The Stripe checkout session this consent unlocked (traceability).
  stripe_checkout_session_id TEXT,
  -- Free-form extra facts (never interpretations).
  evidence            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT app_consent_evidence_type_chk CHECK (
    consent_type IN ('IMMEDIATE_SUPPLY_DIGITAL_CONTENT', 'TERMS_ACCEPTANCE')
  )
);

CREATE INDEX IF NOT EXISTS idx_app_consent_evidence_user
  ON app_consent_evidence (user_id);
CREATE INDEX IF NOT EXISTS idx_app_consent_evidence_order
  ON app_consent_evidence (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_consent_evidence_session
  ON app_consent_evidence (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON TABLE app_consent_evidence IS
  'PB-MARKET-CONSENT-001: APPEND-ONLY evidence of express consent before immediate supply of digital content (withdrawal-right regime). Facts only: version key, server-resolved text + SHA-256, timestamps, request metadata. Wording revisions are new text_version values; historical rows keep the wording actually shown.';


-- =============================================================================
-- 2. app_supply_events — when the supply/access effectively began
-- =============================================================================
-- The legal clock starts at the BEGINNING OF THE SUPPLY, not at the click.
-- For a recorded course the supply begins when access is granted, i.e. when
-- the webhook marks the order paid and the entitlement opens. Recorded as a
-- separate append-only fact so the consent row stays untouched.

CREATE TABLE IF NOT EXISTS app_supply_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES app_orders(id) ON DELETE RESTRICT,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  consent_id          UUID REFERENCES app_consent_evidence(id) ON DELETE RESTRICT,
  event_type          TEXT NOT NULL,
  occurred_at         TIMESTAMPTZ NOT NULL,
  -- Durable confirmation: the buyer receives a durable record of the
  -- purchase + consent (order confirmation / invoice). This flags WHICH
  -- artifact carries it; NULL until sent.
  durable_confirmation_ref TEXT,
  evidence            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT app_supply_events_type_chk CHECK (
    event_type IN ('SUPPLY_STARTED', 'DURABLE_CONFIRMATION_SENT')
  )
);

-- One supply start per order. A retrying webhook must not mint a second
-- "the supply began" fact.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_supply_events_one_start
  ON app_supply_events (order_id) WHERE event_type = 'SUPPLY_STARTED';
CREATE INDEX IF NOT EXISTS idx_app_supply_events_user
  ON app_supply_events (user_id);

COMMENT ON TABLE app_supply_events IS
  'PB-MARKET-CONSENT-001: APPEND-ONLY record of when digital supply effectively began (entitlement opened) and of the durable confirmation delivered to the buyer. The withdrawal-right clock reads from SUPPLY_STARTED.occurred_at, never from course-progress percentages.';


-- =============================================================================
-- 3. WHICH PRODUCTS REQUIRE THE CONSENT
-- =============================================================================
-- The requirement is a CATALOG FACT, not a client claim: create-checkout reads
-- this flag and refuses a session for a flagged product unless the request
-- carries a valid consent. MVP = recorded digital courses only (PO 2026-09-23
-- section 2): the two course products are flagged. Exam booking/intermediation
-- and B2B services are NOT digital content supplied immediately and stay false.

ALTER TABLE app_stripe_prices
  ADD COLUMN IF NOT EXISTS requires_supply_consent BOOLEAN NOT NULL DEFAULT false;

UPDATE app_stripe_prices
   SET requires_supply_consent = true
 WHERE product_key IN ('vca_course_bvca', 'prl_course_intermedio');

COMMENT ON COLUMN app_stripe_prices.requires_supply_consent IS
  'PB-MARKET-CONSENT-001: true = immediate-supply digital content; create-checkout must refuse the session without a recorded IMMEDIATE_SUPPLY_DIGITAL_CONTENT consent. Catalog fact, server-enforced.';


-- =============================================================================
-- 4. RLS — append-only, evidence readable by its owner
-- =============================================================================

ALTER TABLE app_consent_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_supply_events ENABLE ROW LEVEL SECURITY;

-- The buyer may read their own evidence (a durable record they can keep).
DROP POLICY IF EXISTS consent_evidence_owner_read ON app_consent_evidence;
CREATE POLICY consent_evidence_owner_read ON app_consent_evidence
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS consent_evidence_admin_read ON app_consent_evidence;
CREATE POLICY consent_evidence_admin_read ON app_consent_evidence
  FOR SELECT TO authenticated
  USING (app_is_admin());

DROP POLICY IF EXISTS supply_events_owner_read ON app_supply_events;
CREATE POLICY supply_events_owner_read ON app_supply_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS supply_events_admin_read ON app_supply_events;
CREATE POLICY supply_events_admin_read ON app_supply_events
  FOR SELECT TO authenticated
  USING (app_is_admin());

-- NO insert/update/delete policies: writes come from service_role, which
-- bypasses RLS. Append-only is enforced by absence, the same pattern as
-- app_marketplace_revenue_events (005).

GRANT SELECT ON app_consent_evidence TO authenticated;
GRANT SELECT ON app_supply_events TO authenticated;


-- =============================================================================
-- 4. VERIFICATION (operator, after applying)
-- =============================================================================
--
--   SELECT count(*) FROM information_schema.tables
--   WHERE table_schema='public'
--     AND table_name IN ('app_consent_evidence','app_supply_events');
--   EXPECT: 2.
--
--   SELECT cmd FROM pg_policies
--   WHERE tablename IN ('app_consent_evidence','app_supply_events');
--   EXPECT: SELECT policies only (4 rows), no INSERT/UPDATE/DELETE/ALL.
