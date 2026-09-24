-- =============================================================================
-- PB-MARKET-NCR-LEDGER-001: instructor ledger, T+30 settlement, self-billing
-- =============================================================================
--
-- PURPOSE (PO GO 2026-09-23, T7; DEC-65/66/69 PO LOCKED):
--
--   Flow:  SALE -> revenue events (raw facts, 005)
--          -> instructor ledger entries
--          -> T+30 settlement (NCR computed and FROZEN here)
--          -> self-billing invoice
--          -> bank transfer
--          -> PAID
--
-- CANONICAL NET REVENUE (exactly ONE implementation — the SQL function
-- app_net_revenue_cents below; every consumer reads settlement results or
-- calls this function, nobody re-implements the formula):
--
--   GROSS CUSTOMER PAYMENT
--     − indirect taxes
--     − discounts
--     − refunds
--     − chargebacks
--     − payment-processing/transaction fees
--   = NET REVENUE
--
--   instructor share = split% × NET REVENUE   (STANDARD 70/30, DEC-65;
--   tier/config preserved per DEC-59 — the split in force is SNAPSHOTTED on
--   the settlement, never re-read later)
--
-- POST-PAYOUT (PO, section 5): a refund/chargeback after the instructor was
-- paid produces an OFFSET entry first (compensated against future
-- settlements); if no sufficient future balance exists, the remainder is a
-- RECOVERABLE contractual amount (tracked as data, collected out of band).
-- NO rolling reserve in MVP.
--
-- HARD RULES:
--   * The ledger is APPEND-ONLY at the fact level: entry rows are never
--     edited; only their settlement STATUS moves forward (PENDING ->
--     AVAILABLE -> SCHEDULED -> PAID), which is lifecycle, not history.
--   * Snapshots are IMMUTABLE: a later change of VAT id, address, IBAN or
--     split NEVER modifies a historical settlement/invoice (PO, T7).
--   * Stripe is not the source of truth: payout rail is data
--     ('BANK_TRANSFER' now, 'STRIPE_CONNECT' possible later), and the ledger
--     stands independent of the payment provider.
--
-- IDEMPOTENT: YES. STATUS: NOT APPLIED (operator, PB-OPS-SQLSTATE-001).
-- =============================================================================


-- =============================================================================
-- 1. CANONICAL NET REVENUE — the single implementation
-- =============================================================================
-- Every surface (settlement runner, instructor dashboard, self-billing,
-- accounting exports, reporting) uses this function or reads results it
-- produced. A second implementation of this formula anywhere is a defect.

CREATE OR REPLACE FUNCTION app_net_revenue_cents(
  p_gross_cents       BIGINT,
  p_tax_cents         BIGINT,
  p_discounts_cents   BIGINT,
  p_refunds_cents     BIGINT,
  p_chargebacks_cents BIGINT,
  p_fees_cents        BIGINT
) RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_gross_cents, 0)
       - COALESCE(p_tax_cents, 0)
       - COALESCE(p_discounts_cents, 0)
       - COALESCE(p_refunds_cents, 0)
       - COALESCE(p_chargebacks_cents, 0)
       - COALESCE(p_fees_cents, 0);
$$;

COMMENT ON FUNCTION app_net_revenue_cents(BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT) IS
  'PB-MARKET-NCR-LEDGER-001 (DEC-65): THE canonical Net Revenue formula — gross − indirect taxes − discounts − refunds − chargebacks − processing fees. The ONLY implementation; every consumer calls this or reads frozen settlement results. Never split over price gross of VAT (DEC-65).';


-- =============================================================================
-- 2. app_instructor_ledger_entries — fact log per instructor
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_instructor_ledger_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id     UUID NOT NULL REFERENCES app_marketplace_instructors(id) ON DELETE RESTRICT,
  -- Source facts. Nullable: an OFFSET may reference the original entry
  -- instead of a fresh revenue event.
  order_id          UUID REFERENCES app_orders(id) ON DELETE RESTRICT,
  revenue_event_id  UUID REFERENCES app_marketplace_revenue_events(id) ON DELETE RESTRICT,
  offsets_entry_id  UUID REFERENCES app_instructor_ledger_entries(id) ON DELETE RESTRICT,
  -- PO 2026-09-24, section 2 — 1:1 TRACEABILITY: every REFUND /
  -- PARTIAL_REFUND / CHARGEBACK / REVERSAL keeps an explicit link to the
  -- ORIGINAL sale it refers to. instructor_id is the row owner; with
  -- course_id + stripe_payment_reference the full chain closes:
  --   original order (order_id) · original payment (stripe_payment_reference)
  --   original revenue event (revenue_event_id) · original course (course_id)
  --   original instructor (instructor_id) · amount affected (amount_cents)
  -- A closed settlement is NEVER modified retroactively: the April debit
  -- links to the January sale; the January settlement stays immutable.
  course_id             UUID REFERENCES app_academy_courses(id) ON DELETE SET NULL,
  stripe_payment_reference TEXT,
  -- SALE_CREDIT: instructor-side credit from a sale (split applied at
  --   settlement, NOT here — this row carries the sale's gross facts only).
  -- REFUND_DEBIT / CHARGEBACK_DEBIT: post-sale reversals.
  -- OFFSET: compensation of a post-payout reversal against future balance.
  -- RECOVERABLE: contractual debt when no future balance suffices.
  entry_type        TEXT NOT NULL,
  -- Lifecycle ONLY (never edits the fact): PENDING -> AVAILABLE (T+30) ->
  -- SCHEDULED (in a settlement) -> PAID. ADJUSTED marks an entry neutralised
  -- by a later OFFSET/REFUND row.
  status            TEXT NOT NULL DEFAULT 'PENDING',
  -- Signed minor units: credits positive, debits negative.
  amount_cents      BIGINT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'EUR',
  -- The settlement that scheduled/paid this entry (NULL until then).
  settlement_id     UUID,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- AVAILABLE from this instant (T+30 from the sale, DEC-66).
  available_at      TIMESTAMPTZ,
  note              TEXT,
  livemode          BOOLEAN,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT app_instructor_ledger_type_chk CHECK (
    entry_type IN ('SALE_CREDIT', 'REFUND_DEBIT', 'CHARGEBACK_DEBIT', 'OFFSET', 'RECOVERABLE', 'ADJUSTMENT')
  ),
  CONSTRAINT app_instructor_ledger_status_chk CHECK (
    status IN ('PENDING', 'AVAILABLE', 'SCHEDULED', 'PAID', 'ADJUSTED')
  )
);

-- FK to settlements added after the settlements table exists (section 3).
CREATE INDEX IF NOT EXISTS idx_app_ile_instructor_status
  ON app_instructor_ledger_entries (instructor_id, status);
CREATE INDEX IF NOT EXISTS idx_app_ile_settlement
  ON app_instructor_ledger_entries (settlement_id) WHERE settlement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_ile_available
  ON app_instructor_ledger_entries (available_at) WHERE status = 'PENDING';

COMMENT ON TABLE app_instructor_ledger_entries IS
  'PB-MARKET-NCR-LEDGER-001: append-only instructor ledger, independent of the payment/payout provider. Facts are never edited; only lifecycle status moves forward. OFFSET first, RECOVERABLE when no future balance (PO 2026-09-23, section 5). No rolling reserve.';


-- =============================================================================
-- 3. app_settlements — T+30, NCR computed once and FROZEN
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_settlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id       UUID NOT NULL REFERENCES app_marketplace_instructors(id) ON DELETE RESTRICT,
  -- The LegalEntity that issued this settlement (007). Snapshotted below.
  legal_entity_id     UUID REFERENCES app_legal_entities(id) ON DELETE RESTRICT,
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'EUR',

  -- FROZEN COMPUTATION (app_net_revenue_cents inputs + result). Written once
  -- at settlement time from the ledger facts and never recomputed in place.
  gross_cents         BIGINT NOT NULL,
  tax_cents           BIGINT NOT NULL,
  discounts_cents     BIGINT NOT NULL,
  refunds_cents       BIGINT NOT NULL,
  chargebacks_cents   BIGINT NOT NULL,
  fees_cents          BIGINT NOT NULL,
  net_revenue_cents   BIGINT NOT NULL,
  -- The split IN FORCE, snapshot: percentages are config (DEC-59 tiers), and
  -- a later tier change never rewrites a settled period.
  instructor_share_pct  NUMERIC(5,2) NOT NULL,
  instructor_share_cents BIGINT NOT NULL,
  platform_share_cents   BIGINT NOT NULL,
  -- OFFSET applied from prior post-payout reversals.
  offset_applied_cents BIGINT NOT NULL DEFAULT 0,
  payable_cents        BIGINT NOT NULL,

  -- IMMUTABLE SNAPSHOTS (PO, T7): instructor legal identity, tax residence,
  -- TIN/VAT, address, IBAN, and the LegalEntity issuer — all as they were at
  -- settlement time. Later profile changes never touch these.
  instructor_snapshot  JSONB NOT NULL,
  issuer_snapshot      JSONB NOT NULL,

  -- SCHEDULED (computed, awaiting payout) -> PAID (bank transfer done).
  -- CANCELLED only before payout, with a reason in note.
  status              TEXT NOT NULL DEFAULT 'SCHEDULED',
  payout_rail         TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  payout_reference    TEXT,
  scheduled_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at             TIMESTAMPTZ,
  note                TEXT,
  livemode            BOOLEAN,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT app_settlements_status_chk CHECK (
    status IN ('SCHEDULED', 'PAID', 'CANCELLED')
  ),
  CONSTRAINT app_settlements_rail_chk CHECK (
    payout_rail IN ('BANK_TRANSFER', 'STRIPE_CONNECT')
  ),
  CONSTRAINT app_settlements_split_chk CHECK (
    instructor_share_pct >= 0 AND instructor_share_pct <= 100
  ),
  -- The frozen arithmetic must reconcile at write time. This is the canonical
  -- formula enforced as data, not re-derived by readers.
  CONSTRAINT app_settlements_ncr_coherent_chk CHECK (
    net_revenue_cents = gross_cents - tax_cents - discounts_cents
                      - refunds_cents - chargebacks_cents - fees_cents
    AND instructor_share_cents + platform_share_cents = net_revenue_cents
    AND payable_cents = instructor_share_cents - offset_applied_cents
  )
);

ALTER TABLE app_instructor_ledger_entries
  ADD CONSTRAINT app_ile_settlement_fk
  FOREIGN KEY (settlement_id) REFERENCES app_settlements(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_app_settlements_instructor
  ON app_settlements (instructor_id, status);
CREATE INDEX IF NOT EXISTS idx_app_settlements_status
  ON app_settlements (status) WHERE status = 'SCHEDULED';

COMMENT ON TABLE app_settlements IS
  'PB-MARKET-NCR-LEDGER-001 (DEC-66): T+30 settlement. Net Revenue computed ONCE from ledger facts via the canonical formula and frozen; split snapshot; instructor + issuer snapshots immutable. Payout rail is data (BANK_TRANSFER now).';


-- =============================================================================
-- 4. app_self_billing_invoices — one per settlement
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_self_billing_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id       UUID NOT NULL UNIQUE REFERENCES app_settlements(id) ON DELETE RESTRICT,
  instructor_id       UUID NOT NULL REFERENCES app_marketplace_instructors(id) ON DELETE RESTRICT,
  legal_entity_id     UUID REFERENCES app_legal_entities(id) ON DELETE RESTRICT,
  -- Invoice numbering per issuer (prefix + per-entity sequence, section 5).
  invoice_number      TEXT NOT NULL UNIQUE,
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'EUR',
  -- Amounts copied from the frozen settlement — the invoice MUST equal the
  -- settlement it bills, so these are copies, not a recomputation.
  net_revenue_cents   BIGINT NOT NULL,
  instructor_share_cents BIGINT NOT NULL,
  payable_cents       BIGINT NOT NULL,
  -- IMMUTABLE SNAPSHOTS: instructor legal details + tax status + bank data,
  -- and the issuer, as at issuance (PO, T7). Historical documents never change.
  instructor_snapshot JSONB NOT NULL,
  issuer_snapshot     JSONB NOT NULL,
  -- DRAFT (generated with the settlement) -> ISSUED (sent/available) -> PAID.
  status              TEXT NOT NULL DEFAULT 'DRAFT',
  pdf_path            TEXT,
  issued_at           TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  livemode            BOOLEAN,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT app_sbi_status_chk CHECK (
    status IN ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_app_sbi_instructor
  ON app_self_billing_invoices (instructor_id, status);

COMMENT ON TABLE app_self_billing_invoices IS
  'PB-MARKET-NCR-LEDGER-001 (DEC-66): self-billing invoice per settlement. PIPINGBOX bills itself on behalf of the instructor (approved PO 2026-09-23). Numbering per LegalEntity; snapshots immutable; amounts copied from the frozen settlement.';


-- =============================================================================
-- 5. INVOICE NUMBERING — PO LOCKED 2026-09-24, section 1
-- =============================================================================
-- Format: SB-{LEGAL_ENTITY_COUNTRY}-{YYYY}-{NNNNNN}
--   Phase 1:  SB-BE-2026-000001, SB-BE-2026-000002, ...
--   Future:   SB-EE-2027-000001 (new series per LegalEntity)
-- Rules: atomic sequence; unique per LegalEntity + YEAR; strictly
-- consecutive; numbers are NEVER reused; historical invoices are immutable;
-- the BE -> EE cut-over starts the new entity's own series. The 'SB' bare
-- fallback is FORBIDDEN in real documents (test/dev only, and only when no
-- LegalEntity is active — which the settlement runner already refuses).

CREATE TABLE IF NOT EXISTS app_invoice_sequences (
  legal_entity_id UUID NOT NULL REFERENCES app_legal_entities(id) ON DELETE RESTRICT,
  year            INT  NOT NULL,
  next_value      BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (legal_entity_id, year)
);

-- Atomic per-issuer, per-YEAR numbering. The country segment is the entity's
-- jurisdiction (007: 'BE' / 'EE'). Raises when the entity does not exist: a
-- real document must never carry an invented country, and the runner never
-- issues a settlement without an active entity.
CREATE OR REPLACE FUNCTION app_next_self_billing_number(p_legal_entity_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_country TEXT;
  v_year    INT := extract(year from now())::int;
  v_value   BIGINT;
BEGIN
  SELECT jurisdiction INTO v_country
    FROM app_legal_entities WHERE id = p_legal_entity_id;

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'legal entity % not found: self-billing numbering requires a real LegalEntity (no fallback in real documents)', p_legal_entity_id;
  END IF;

  INSERT INTO app_invoice_sequences (legal_entity_id, year, next_value)
  VALUES (p_legal_entity_id, v_year, 2)
  ON CONFLICT (legal_entity_id, year)
  DO UPDATE SET next_value = app_invoice_sequences.next_value + 1
  RETURNING next_value - 1 INTO v_value;

  RETURN 'SB-' || v_country || '-' || v_year::text || '-' || lpad(v_value::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION app_next_self_billing_number(UUID) IS
  'PB-MARKET-NCR-LEDGER-001 (PO LOCKED 2026-09-24): atomic self-billing numbering SB-{COUNTRY}-{YYYY}-{NNNNNN}, unique and consecutive per LegalEntity + year. Country from the entity jurisdiction; series restarts with a new entity (BE -> EE). No bare-SB fallback in real documents.';


-- =============================================================================
-- 6. RLS — instructor reads own, admin all, writes service_role only
-- =============================================================================

ALTER TABLE app_instructor_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_self_billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_invoice_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ile_instructor_read ON app_instructor_ledger_entries;
CREATE POLICY ile_instructor_read ON app_instructor_ledger_entries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_marketplace_instructors i
    WHERE i.id = instructor_id AND i.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS ile_admin_read ON app_instructor_ledger_entries;
CREATE POLICY ile_admin_read ON app_instructor_ledger_entries
  FOR SELECT TO authenticated
  USING (app_is_admin());

DROP POLICY IF EXISTS settlements_instructor_read ON app_settlements;
CREATE POLICY settlements_instructor_read ON app_settlements
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_marketplace_instructors i
    WHERE i.id = instructor_id AND i.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS settlements_admin_read ON app_settlements;
CREATE POLICY settlements_admin_read ON app_settlements
  FOR SELECT TO authenticated
  USING (app_is_admin());

DROP POLICY IF EXISTS sbi_instructor_read ON app_self_billing_invoices;
CREATE POLICY sbi_instructor_read ON app_self_billing_invoices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_marketplace_instructors i
    WHERE i.id = instructor_id AND i.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS sbi_admin_read ON app_self_billing_invoices;
CREATE POLICY sbi_admin_read ON app_self_billing_invoices
  FOR SELECT TO authenticated
  USING (app_is_admin());

-- Sequences: admin read only; the function runs as the caller but the table
-- itself is never client-writable (service_role path).
DROP POLICY IF EXISTS invoice_sequences_admin_read ON app_invoice_sequences;
CREATE POLICY invoice_sequences_admin_read ON app_invoice_sequences
  FOR SELECT TO authenticated
  USING (app_is_admin());

GRANT SELECT ON app_instructor_ledger_entries TO authenticated;
GRANT SELECT ON app_settlements TO authenticated;
GRANT SELECT ON app_self_billing_invoices TO authenticated;
GRANT SELECT ON app_invoice_sequences TO authenticated;


-- =============================================================================
-- 7. VERIFICATION (operator, after applying)
-- =============================================================================
--
--   SELECT app_net_revenue_cents(12100, 2100, 0, 0, 0, 300);
--   EXPECT: 9700  (gross 121.00 − VAT 21.00 − fees 3.00).
--
--   -- Numbering (PO LOCKED 2026-09-24). Activate the BE entity first, then:
--   SELECT app_next_self_billing_number(
--     (SELECT id FROM app_legal_entities WHERE entity_key = 'BE_SOLE_PROPRIETOR'));
--   Run TWICE. EXPECT: SB-BE-2026-000001 then SB-BE-2026-000002
--   (year = current year). A second entity would start its own series.
--
--   SELECT cmd FROM pg_policies
--   WHERE tablename IN ('app_instructor_ledger_entries','app_settlements',
--                       'app_self_billing_invoices','app_invoice_sequences');
--   EXPECT: SELECT policies only.
--
--   -- 1:1 traceability probe: after a refund in staging, the debit entry
--   -- must carry the ORIGINAL sale's order/payment/revenue-event/course:
--   SELECT entry_type, order_id, stripe_payment_reference, revenue_event_id,
--          course_id, amount_cents
--     FROM app_instructor_ledger_entries
--    WHERE entry_type IN ('REFUND_DEBIT','CHARGEBACK_DEBIT');
--   EXPECT: every debit row has order_id + payment reference populated and a
--   NEGATIVE amount; the referenced settlement (if any) is untouched.
--
--   -- Snapshot immutability probe (must FAIL with insufficient_privilege
--   -- for any non-service role):
--   -- UPDATE app_settlements SET instructor_snapshot = '{}' WHERE false;
