-- =============================================================================
-- PB-MARKET-REVENUE-EVENTS-001: neutral raw-fact capture for the marketplace
-- =============================================================================
--
-- PURPOSE:
-- Stop losing economic facts while the tax questions are still open. Every
-- purchase, refund and chargeback carries facts that exist only at the instant
-- they happen — the Stripe fee actually charged, the amount actually settled,
-- the coupon actually applied, the country evidence actually observed, the
-- instructor tier actually in force. None of those can be reconstructed later.
-- This migration records them and nothing else.
--
-- THE GOVERNING PRINCIPLE — RECORD FACTS, NEVER DERIVE:
-- Recording a fact never prejudges its interpretation. That is precisely what
-- lets the fiscal decision be deferred at zero cost. A DERIVED column bakes in
-- an answer: the moment this table gains a "net_course_revenue" or an
-- "instructor_share", the Net Course Revenue definition has been chosen by
-- accident, in a migration, instead of deliberately in PB-MARKET-TAX-001.
--
-- The neutral flow is:
--   Instructor -> Course -> Purchase -> Revenue Event -> Instructor Balance -> Payout
-- This migration implements ONLY `Revenue Event`, and repairs `Purchase`.
-- `Instructor Balance` and `Payout` are DELIBERATELY NOT CREATED: they are
-- derived concepts, and creating them would force a choice of Net Course
-- Revenue definition. When that definition is settled they become views or
-- computations OVER these events — never new source-of-truth tables.
--
-- SCOPE:
-- Creates 1 new table:
--   app_marketplace_revenue_events
-- Touches two existing tables by ADD COLUMN IF NOT EXISTS / CHECK replacement:
--   app_orders   — course_id, instructor_id, instructor_tier_at_sale,
--                  acquisition_channel, referral_code, referring_user_id,
--                  refunded_amount_cents, and a widened status CHECK that
--                  separates a chargeback from a refund
--   app_invoices — vat_determination_status, plus the raw inputs a correct
--                  determination will need later
-- No existing column is altered or dropped.
--
-- EXPLICITLY OUT OF SCOPE — BLOCKED BY PB-MARKET-TAX-001:
-- No Net Course Revenue calculation. No revenue split. No platform fee. No
-- percentage anywhere. No instructor balance. No payout. No Stripe Connect, no
-- application_fee_amount, no destination charges, no self-billing. No VAT
-- determination engine. This file records observations and takes no position.
--
-- DEPENDS ON:
--   sql/003-stripe-payments-schema.sql  (APPLIED — app_orders, app_invoices)
--   sql/004-marketplace-schema.sql      (NOT APPLIED — app_marketplace_instructors)
-- 004 MUST be applied before this file: section 2 adds a foreign key to
-- app_marketplace_instructors, which 004 creates.
--
-- REVERSIBLE:
-- YES — run the ROLLBACK section at the bottom to undo everything. Note that
-- rolling back DESTROYS the event log, which is the one thing here that cannot
-- be rebuilt from Stripe beyond Stripe's own retention window.
--
-- IDEMPOTENT:
-- YES — create table if not exists, add column if not exists, do $$ ... $$
-- guards for constraints, drop policy if exists before every create policy.
-- Safe to re-run.
--
-- STATUS: NOT APPLIED. This file has never been executed against any database.
-- It must be run against Supabase by the operator. See section 7.
-- =============================================================================


-- =============================================================================
-- 1. app_orders — repair
-- =============================================================================
-- app_orders was designed for a single-vendor shop: a fixed catalogue keyed by
-- product_key, with one seller (PipingBox) implied everywhere. In a marketplace
-- that model cannot answer the most basic question there is — WHOSE sale was
-- this? There is no course reference and no instructor reference, so a sale of
-- a third-party course is today indistinguishable from a sale of a PipingBox
-- Original.
--
-- Everything below is nullable and idempotent. Nullable because existing paid
-- orders genuinely have no instructor (they are PipingBox Originals) and
-- back-filling them with a guess would be inventing data.

ALTER TABLE app_orders
  ADD COLUMN IF NOT EXISTS course_id UUID;

ALTER TABLE app_orders
  ADD COLUMN IF NOT EXISTS instructor_id UUID;

-- The tier IN FORCE AT THE INSTANT OF SALE. Tiers change: an instructor
-- promoted from STANDARD to FOUNDING next quarter must not retroactively
-- change the terms of a sale made today. Reading the tier from the instructor
-- row at settlement time would do exactly that, silently.
--
-- The TIER LABEL ONLY. Never a percentage: percentages are channel-dependent,
-- live in application config, and writing one here would be both a derived
-- value and a premature answer to PB-MARKET-TAX-001.
ALTER TABLE app_orders
  ADD COLUMN IF NOT EXISTS instructor_tier_at_sale TEXT;

-- No CHECK on purpose. The set of acquisition channels is a commercial
-- question that changes faster than the schema should: freezing it in a
-- constraint means a migration every time marketing launches a channel, and
-- in the meantime the write fails and the fact is lost. An unconstrained TEXT
-- records whatever actually happened.
ALTER TABLE app_orders
  ADD COLUMN IF NOT EXISTS acquisition_channel TEXT;

ALTER TABLE app_orders
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

ALTER TABLE app_orders
  ADD COLUMN IF NOT EXISTS referring_user_id UUID;

-- A partial refund is currently indistinguishable from a full one: status goes
-- to 'refunded' and refunded_at is stamped, with no amount anywhere. Two very
-- different economic events collapse into the same row.
ALTER TABLE app_orders
  ADD COLUMN IF NOT EXISTS refunded_amount_cents INTEGER;


-- 1.1 Foreign keys, added idempotently (ADD CONSTRAINT has no IF NOT EXISTS).
--
--     Both are ON DELETE SET NULL, matching the precedent set by
--     app_academy_courses_instructor_fk in 004: deleting a course or an
--     instructor record must never delete the financial history of a real
--     payment. The order survives with the attribution blanked and surfaces
--     for review.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_orders_course_fk'
  ) THEN
    ALTER TABLE app_orders
      ADD CONSTRAINT app_orders_course_fk
      FOREIGN KEY (course_id)
      REFERENCES app_academy_courses(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_orders_instructor_fk'
  ) THEN
    ALTER TABLE app_orders
      ADD CONSTRAINT app_orders_instructor_fk
      FOREIGN KEY (instructor_id)
      REFERENCES app_marketplace_instructors(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_orders_referring_user_fk'
  ) THEN
    ALTER TABLE app_orders
      ADD CONSTRAINT app_orders_referring_user_fk
      FOREIGN KEY (referring_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- 1.2 status — a CHARGEBACK IS NOT A REFUND.
--
--     003 declared the constraint inline:
--       status TEXT NOT NULL DEFAULT 'pending'
--         CHECK (status IN ('pending','paid','refunded','failed'))
--     An inline unnamed CHECK is named by Postgres after the pattern
--     <table>_<column>_check, i.e. app_orders_status_check. That is the name
--     dropped below — verified against sql/003-stripe-payments-schema.sql
--     lines 110-111 rather than guessed.
--
--     Why this matters beyond naming: today a chargeback has nowhere to go
--     except 'refunded'. They are different events in every respect that
--     counts —
--       cause      : refund is a decision we made; a chargeback is imposed on us
--       liability  : a refund is voluntary; a chargeback is disputed and may be won
--       cost       : a chargeback carries a dispute fee a refund does not
--       treatment  : whether an instructor bears a chargeback the way they bear
--                    a refund is an OPEN question, and collapsing the two
--                    destroys the evidence needed to answer it
--     Recording them separately does not decide who bears what. It just stops
--     the answer from being foreclosed.
--
--     'disputed'  — a dispute is open, the outcome is unknown
--     'chargeback' — the dispute was lost and the funds were withdrawn
--
--     DROP + ADD rather than an in-place edit, so re-running converges.

DO $$
BEGIN
  ALTER TABLE app_orders DROP CONSTRAINT IF EXISTS app_orders_status_check;

  ALTER TABLE app_orders
    ADD CONSTRAINT app_orders_status_check
    CHECK (status IN (
      'pending',
      'paid',
      'refunded',
      'failed',
      'disputed',
      'chargeback'
    ));
END $$;


CREATE INDEX IF NOT EXISTS idx_app_orders_course
  ON app_orders(course_id);
CREATE INDEX IF NOT EXISTS idx_app_orders_instructor
  ON app_orders(instructor_id);

COMMENT ON COLUMN app_orders.instructor_tier_at_sale IS
  'Tier in force at the instant of sale. Label only, never a percentage. A past sale '
  'must stay interpretable under the terms that applied then, not under today''s tier.';
COMMENT ON COLUMN app_orders.acquisition_channel IS
  'Free text on purpose: the channel set is commercial and must not be frozen in a CHECK.';
COMMENT ON COLUMN app_orders.refunded_amount_cents IS
  'Observed refunded amount. Without it a partial refund is indistinguishable from a full one.';
COMMENT ON COLUMN app_orders.status IS
  'pending | paid | refunded | failed | disputed | chargeback. A chargeback is NOT a '
  'refund: different cause, liability, cost and treatment. Do not re-collapse them.';


-- =============================================================================
-- 2. app_marketplace_revenue_events — APPEND-ONLY LEDGER OF OBSERVED FACTS
-- =============================================================================
--
-- ############################################################################
-- #                                                                          #
-- #  ADDING A DERIVED COLUMN TO THIS TABLE IS A DEFECT.                      #
-- #                                                                          #
-- #  Every column here is an OBSERVED FACT at the moment of the transaction: #
-- #  a number Stripe reported, a code the buyer typed, a country we saw. No  #
-- #  column may be a function of other columns. Concretely, and without      #
-- #  limitation, the following must NEVER appear in this table:              #
-- #                                                                          #
-- #    net_course_revenue      instructor_share      platform_fee            #
-- #    take_rate               revenue_split         instructor_earnings     #
-- #    platform_commission     any *_percentage / *_percent / *_rate share   #
-- #                                                                          #
-- #  Reason: Net Course Revenue has no agreed definition yet. Does it net    #
-- #  the Stripe fee? The VAT? A refund? A chargeback fee? A coupon the       #
-- #  platform funded? Each answer produces a different number from the SAME  #
-- #  facts. Writing any of them into a column silently picks one, forever,   #
-- #  for every historical row — and the choice becomes invisible the day     #
-- #  after it is made. PB-MARKET-TAX-001 makes that choice explicitly.       #
-- #                                                                          #
-- #  INSTRUCTOR BALANCE AND PAYOUT ARE NOT TABLES. Once the NCR definition   #
-- #  is settled they are VIEWS or COMPUTATIONS over these events. A balance  #
-- #  stored as a column is a cached derivation that drifts; a balance        #
-- #  computed from an append-only event log is reproducible and auditable    #
-- #  under any definition, including one adopted retroactively.              #
-- #                                                                          #
-- #  scripts/check-schema-guard.mjs enforces the names above.                #
-- #                                                                          #
-- ############################################################################
--
-- APPEND-ONLY. There is no UPDATE and no DELETE, by construction:
--   * RLS is enabled and NO update policy and NO delete policy exist on this
--     table for any role. authenticated therefore cannot modify or remove a
--     row under any circumstances.
--   * The GRANTs in section 4 give authenticated SELECT and nothing else, so
--     PostgREST refuses an UPDATE/DELETE before RLS is even consulted. Both
--     layers are deliberate — PB-SEC-RLS-WORKFORCE-001 was caused by relying
--     on one of them alone.
--   * service_role bypasses RLS, so it CAN physically update or delete. That
--     is a deliberate operational escape hatch, not a licence: the webhook
--     inserts and never updates. A correction is a NEW compensating event of
--     type 'ADJUSTMENT', never an edit of a past one. Editing history makes
--     the log unusable as evidence, which is the only reason it exists.
--
-- SENSITIVE. raw_payload and every buyer_* column contain student personal
-- data. The product spec sets a hard GDPR rule that instructors receive NO
-- student personal data, so the instructor-facing policy in section 4 is paired
-- with a restricted view in section 5. Postgres RLS filters ROWS, not COLUMNS —
-- read that section before widening anything.

CREATE TABLE IF NOT EXISTS app_marketplace_revenue_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ---------------------------------------------------------------------------
  -- What the event is about. Nullable FKs for the same reason as section 1.1:
  -- financial history must outlive the deletion of a course or an instructor.
  -- ---------------------------------------------------------------------------
  order_id                UUID REFERENCES app_orders(id) ON DELETE SET NULL,
  course_id               UUID REFERENCES app_academy_courses(id) ON DELETE SET NULL,
  instructor_id           UUID REFERENCES app_marketplace_instructors(id) ON DELETE SET NULL,

  -- CHARGEBACK and CHARGEBACK_REVERSAL are separate values on purpose: a
  -- dispute that is later won reverses the withdrawal, and the pair of events
  -- is the only honest record of what happened. Netting them into one row
  -- would erase the fact that a dispute occurred at all.
  event_type              TEXT NOT NULL
                            CHECK (event_type IN (
                              'SALE',
                              'REFUND',
                              'PARTIAL_REFUND',
                              'CHARGEBACK',
                              'CHARGEBACK_REVERSAL',
                              'ADJUSTMENT'
                            )),

  -- When the event HAPPENED, as reported by Stripe — not when we wrote it
  -- down. created_at below records the latter. They differ on webhook retries
  -- and backfills, and conflating them corrupts any period-based reporting.
  occurred_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ---------------------------------------------------------------------------
  -- MONETARY FACTS. Every one of these is a number Stripe reported for this
  -- event. None is computed by us. Signs follow Stripe: a refund or chargeback
  -- carries negative amounts, so a period total is a plain SUM with no
  -- direction logic and therefore no place to hide a policy decision.
  --
  -- All nullable: "Stripe did not report this" and "this was zero" are
  -- different facts, and NULL is the honest way to say the first one. A
  -- balance transaction is not always available at write time (see the
  -- webhook's graceful-degradation path), and defaulting the fee to 0 would
  -- turn a missing observation into a false one.
  -- ---------------------------------------------------------------------------
  currency                TEXT NOT NULL DEFAULT 'EUR',
  gross_amount_cents      INTEGER,       -- total charged to the buyer, tax included
  tax_amount_cents        INTEGER,       -- tax Stripe reported on this event
  discount_amount_cents   INTEGER,       -- total discount applied
  stripe_fee_cents        INTEGER,       -- fee Stripe actually charged (balance transaction)
  -- What Stripe ACTUALLY SETTLED into the account. An observed fact read from
  -- the balance transaction, NOT gross - fee - tax. It differs from any such
  -- arithmetic through FX, cross-border fees and Stripe's own rounding, and
  -- the observed number is the one that has to reconcile with the bank.
  net_settled_cents       INTEGER,

  -- ---------------------------------------------------------------------------
  -- Discount facts. allow_promotion_codes is already live in create-checkout,
  -- so coupon-bearing sales already happen and are currently recorded nowhere.
  -- ---------------------------------------------------------------------------
  coupon_code             TEXT,
  promotion_id            TEXT,
  -- NO CHECK. Who bore the cost of a discount is a fact we frequently do not
  -- know at write time — an instructor-funded promo and a platform-funded one
  -- look identical in the Stripe object. Constraining the column would force
  -- the webhook to guess, and a guess written into a fact table is worse than
  -- a NULL. NULL means "not known", and it stays NULL until something actually
  -- observes it.
  discount_funded_by      TEXT,

  -- ---------------------------------------------------------------------------
  -- Buyer facts. SENSITIVE — personal data. Never exposed to instructors.
  -- ---------------------------------------------------------------------------
  buyer_country           TEXT,          -- ISO 3166-1 alpha-2, as observed
  -- EU VAT place-of-supply rules require TWO NON-CONTRADICTORY pieces of
  -- evidence for the customer's location. Which pieces are available varies by
  -- payment method and by what Stripe returns, so this is JSONB rather than
  -- columns. Shape, all keys optional:
  --   { "billing_country": "ES", "card_country": "ES", "ip_country": "PT",
  --     "payment_method_type": "card", "source": "stripe.charge",
  --     "observed_at": "2026-08-01T10:00:00Z" }
  -- Storing the evidence is registral. It proves nothing about the treatment
  -- and asserts nothing; it simply means the determination remains POSSIBLE
  -- later. Without it, a determination made in 2027 about a 2026 sale would be
  -- an invention.
  buyer_country_evidence  JSONB,
  buyer_vat_number        TEXT,          -- as supplied by the buyer. UNVALIDATED unless
                                         -- evidence of validation exists elsewhere.
  -- NULLABLE THREE-STATE ON PURPOSE. true / false / unknown are three different
  -- facts. Defaulting to false would assert "this is a consumer" about every
  -- buyer we simply did not ask, and B2B-vs-B2C is one of the inputs to the
  -- open VAT question. Unknown must stay unknown.
  buyer_is_business       BOOLEAN,

  -- ---------------------------------------------------------------------------
  -- Context in force at the instant of the event. Same reasoning as
  -- app_orders.instructor_tier_at_sale: terms change, history must not.
  -- Label only, never a percentage.
  -- ---------------------------------------------------------------------------
  instructor_tier_at_event TEXT,
  acquisition_channel      TEXT,

  -- ---------------------------------------------------------------------------
  -- Provenance and idempotency.
  -- ---------------------------------------------------------------------------
  -- UNIQUE is what actually makes webhook retries safe. Stripe retries
  -- deliveries; without this a retry would write a second SALE event for the
  -- same payment and every future total would be wrong. The insert is the
  -- lock — a prior SELECT would race a concurrent retry.
  stripe_event_id         TEXT UNIQUE,
  stripe_object_id        TEXT,          -- charge / refund / dispute id this event came from
  -- The complete Stripe object. SENSITIVE: contains buyer personal data.
  -- Kept because a fact we failed to model today is still recoverable from it
  -- tomorrow, which is the whole point of this migration.
  raw_payload             JSONB,

  -- When WE wrote the row. Distinct from occurred_at above.
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_marketplace_revenue_events_instructor
  ON app_marketplace_revenue_events(instructor_id);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_revenue_events_order
  ON app_marketplace_revenue_events(order_id);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_revenue_events_occurred
  ON app_marketplace_revenue_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_revenue_events_course
  ON app_marketplace_revenue_events(course_id);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_revenue_events_type
  ON app_marketplace_revenue_events(event_type);

-- Redundant with the UNIQUE on the column, and deliberately so: the uniqueness
-- of stripe_event_id is the entire idempotency guarantee, and an explicit named
-- index makes its removal a visible act rather than a side effect of someone
-- "cleaning up" the column definition.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_marketplace_revenue_events_stripe_event
  ON app_marketplace_revenue_events(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

COMMENT ON TABLE app_marketplace_revenue_events IS
  'APPEND-ONLY ledger of OBSERVED economic facts. Zero derived columns: no Net Course '
  'Revenue, no split, no platform fee, no percentage, no balance. Adding a derived '
  'column here is a defect — it would silently choose an NCR definition that '
  'PB-MARKET-TAX-001 has not made yet. Instructor Balance and Payout must be views or '
  'computations OVER this table, never stored columns. No UPDATE/DELETE policy exists '
  'and authenticated holds SELECT only; corrections are new ADJUSTMENT events. '
  'SENSITIVE: raw_payload and buyer_* hold student personal data and must never reach '
  'an instructor.';

COMMENT ON COLUMN app_marketplace_revenue_events.occurred_at IS
  'When the event happened per Stripe. created_at is when we wrote it. Not the same thing.';
COMMENT ON COLUMN app_marketplace_revenue_events.net_settled_cents IS
  'What Stripe actually settled, read from the balance transaction. An OBSERVED fact, '
  'not gross - fee - tax: FX and cross-border fees make the arithmetic wrong.';
COMMENT ON COLUMN app_marketplace_revenue_events.stripe_fee_cents IS
  'Fee Stripe actually charged. NULL means the balance transaction was unavailable — '
  'never defaulted to 0, which would turn a missing observation into a false one.';
COMMENT ON COLUMN app_marketplace_revenue_events.discount_funded_by IS
  'Unconstrained and nullable: who bore the discount is often unknown at write time. '
  'NULL means not known. Do not add a CHECK that forces the webhook to guess.';
COMMENT ON COLUMN app_marketplace_revenue_events.buyer_country_evidence IS
  'Corroborating location evidence (billing country, card country, IP country). EU VAT '
  'rules require two non-contradictory items. Registral: proves nothing, decides nothing, '
  'but makes a later determination possible instead of invented.';
COMMENT ON COLUMN app_marketplace_revenue_events.buyer_is_business IS
  'THREE-STATE: true / false / NULL = unknown. Never default this to false — that would '
  'assert "consumer" about every buyer nobody asked.';
COMMENT ON COLUMN app_marketplace_revenue_events.instructor_tier_at_event IS
  'Tier label in force at the instant of the event. Never a percentage.';
COMMENT ON COLUMN app_marketplace_revenue_events.stripe_event_id IS
  'UNIQUE. The idempotency key: a webhook retry hits the unique violation instead of '
  'double-writing the event.';
COMMENT ON COLUMN app_marketplace_revenue_events.raw_payload IS
  'SENSITIVE. Full Stripe object, including buyer personal data. Never expose to an '
  'instructor. Kept so a fact not modelled today stays recoverable tomorrow.';


-- =============================================================================
-- 3. app_invoices — say "not determined" instead of asserting a position
-- =============================================================================
-- THE DEFECT BEING FIXED. stripe-webhook computed:
--
--   reverse_charge: taxCents === 0 && (invoice.customer_address?.country ?? "EE") !== "EE"
--
-- automatic_tax is OFF (create-checkout only enables it when
-- STRIPE_AUTOMATIC_TAX=true, which is off until the OU is VAT-registered), so
-- invoice.tax is ALWAYS 0 and the first operand is ALWAYS true. The expression
-- therefore reduces to "country != EE", meaning EVERY NON-ESTONIAN CUSTOMER
-- WAS BEING RECORDED AS REVERSE CHARGE — including B2C consumers, for whom
-- reverse charge does not exist as a concept. The `?? "EE"` fallback made it
-- worse in the other direction: a customer with no address on file was
-- silently recorded as domestic.
--
-- Reverse charge is an AFFIRMATIVE FISCAL CLAIM that shifts VAT liability to
-- the customer. Asserting it without a validated business VAT number and a B2B
-- determination is simply wrong, and wrong in the direction that under-declares
-- output VAT.
--
-- WHY THIS COLUMN LIVES ON app_invoices AND NOT ON THE EVENTS TABLE:
-- reverse_charge is already a column on app_invoices, and it is the invoice —
-- not the revenue event — that makes the fiscal assertion to the customer.
-- A status column sitting immediately beside the boolean it qualifies cannot
-- be read without also reading the qualifier; the same status on a different
-- table could. The events table stays purely factual, which is its rule.
--
-- vat_determination_status makes the record HONEST. 'AUTOMATIC_TAX_DISABLED'
-- says plainly: no determination was performed, the zero in vat_cents is the
-- absence of a calculation and not the result of one. That is a true statement
-- about our knowledge. `reverse_charge = false` alongside it is the
-- conservative default, and it is not an assertion of anything — it is the
-- absence of the affirmative claim.
--
-- NO DETERMINATION LOGIC IS ADDED HERE OR ANYWHERE ELSE IN THIS MIGRATION.
-- Deliberately deferred to PB-MARKET-TAX-001. Do not improvise it.

ALTER TABLE app_invoices
  ADD COLUMN IF NOT EXISTS vat_determination_status TEXT NOT NULL DEFAULT 'UNDETERMINED';

-- The raw inputs a correct determination will need later, recorded now because
-- they are only observable at invoice time.
ALTER TABLE app_invoices
  ADD COLUMN IF NOT EXISTS customer_country_evidence JSONB;

ALTER TABLE app_invoices
  ADD COLUMN IF NOT EXISTS customer_vat_number_status TEXT;

ALTER TABLE app_invoices
  ADD COLUMN IF NOT EXISTS automatic_tax_enabled BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'app_invoices_vat_determination_status_check'
  ) THEN
    ALTER TABLE app_invoices
      ADD CONSTRAINT app_invoices_vat_determination_status_check
      CHECK (vat_determination_status IN (
        -- No determination has been attempted.
        'UNDETERMINED',
        -- Stripe Tax was off, so the 0 in vat_cents is an absence of
        -- calculation, not the result of one. This is the current state of the
        -- world for every invoice.
        'AUTOMATIC_TAX_DISABLED',
        -- Stripe Tax computed the tax. Reserved for when STRIPE_AUTOMATIC_TAX
        -- is switched on after the OU is VAT-registered.
        'AUTOMATIC_TAX',
        -- A human reviewed and settled this invoice's treatment.
        'MANUAL_REVIEW'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'app_invoices_customer_vat_number_status_check'
  ) THEN
    ALTER TABLE app_invoices
      ADD CONSTRAINT app_invoices_customer_vat_number_status_check
      CHECK (customer_vat_number_status IS NULL OR customer_vat_number_status IN (
        'NOT_PROVIDED',
        'PROVIDED',
        'VIES_VALIDATED',
        'VIES_INVALID'
      ));
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 3.1 The invalid combination must be UNREPRESENTABLE, not merely discouraged
-- -----------------------------------------------------------------------------
-- THE SEMANTIC HAZARD THIS CLOSES.
-- After the change above, `reverse_charge = false` means two different things
-- depending on the column sitting next to it:
--
--   (a) false + UNDETERMINED / AUTOMATIC_TAX_DISABLED
--         = "WE DO NOT KNOW." No determination was performed. This is NOT a
--           finding that domestic VAT applies, and it is NOT a finding that
--           reverse charge does not apply. It is the absence of a finding.
--   (b) false + AUTOMATIC_TAX / MANUAL_REVIEW
--         = "WE LOOKED, AND REVERSE CHARGE DOES NOT APPLY." A real negative
--           conclusion, reached by an actual determination.
--
-- The danger is that (a) and (b) carry the SAME BOOLEAN. Any code that reads
-- reverse_charge on its own silently converts "unknown" into "determined not to
-- apply" — which is precisely the class of error that produced the original
-- defect, only running in the opposite direction.
--
-- The database cannot stop a reader from ignoring the status column; that is
-- what the CI guard in scripts/check-schema-guard.mjs is for. What the database
-- CAN do, and what this constraint does, is make the THIRD combination — the
-- affirmative claim asserted with no determination behind it — impossible to
-- store at all:
--
--   (c) true + UNDETERMINED / AUTOMATIC_TAX_DISABLED   <-- REJECTED HERE
--         = a claim that VAT liability shifted to the customer, recorded by a
--           system that simultaneously states it never determined anything.
--           That is not a defensible fiscal position, it is a contradiction,
--           and under inspection it is the expensive kind.
--
-- reverse_charge = true is an AFFIRMATIVE FISCAL CLAIM that shifts liability.
-- It may only ever coexist with a status representing a genuine determination.
-- Enforcing that here means no future webhook edit, no manual UPDATE and no
-- backfill script can reintroduce the original defect: the write simply fails.
--
-- -----------------------------------------------------------------------------
-- WHY THIS IS SAFE TO ADD TO A TABLE THAT ALREADY HAS PRODUCTION ROWS
-- -----------------------------------------------------------------------------
-- A CHECK constraint added without NOT VALID is verified against every existing
-- row, and a single violating row aborts the statement — which would strand the
-- operator in the middle of this migration. So the question is whether any
-- pre-existing app_invoices row can violate it. It cannot, and the reasoning is
-- exhaustive rather than optimistic:
--
--   1. vat_determination_status is added by THIS FILE, a few statements above,
--      as NOT NULL DEFAULT 'UNDETERMINED'. Every row that existed before this
--      migration therefore holds exactly 'UNDETERMINED' at this point. No other
--      value is reachable: nothing has run between the ADD COLUMN and this
--      constraint that could have changed it.
--
--   2. So the constraint reduces, for existing rows, to `reverse_charge = false`.
--
--   3. Could a pre-existing row hold reverse_charge = true? This is the one
--      that matters, because the ORIGINAL DEFECT WROTE true. Per
--      sql/003-stripe-payments-schema.sql section 6 the column is
--      `reverse_charge BOOLEAN NOT NULL DEFAULT false`, and the only writer is
--      the stripe-webhook invoice upsert. That writer previously computed
--      `taxCents === 0 && country !== "EE"`, which DOES evaluate to true for
--      every non-Estonian customer. If any such invoice was ever written, the
--      row holds true and this constraint would reject it.
--
--      It is safe anyway, because the platform has never issued a live invoice:
--      Stripe is in TEST MODE, PIPINGBOX OU is not yet VAT-registered, and
--      003 is explicit that supplier_vat_id stays NULL until incorporation.
--      app_invoices is expected to be EMPTY.
--
--      "Expected to be empty" is a belief about production, not an observed
--      fact, and this migration must not turn a belief into an assumption that
--      aborts the operator's run. Hence the guard below: instead of trusting
--      the expectation, the DO block MEASURES it and picks the safe branch.
--
-- THE NOT VALID TRADEOFF, AND WHY IT IS RESOLVED DYNAMICALLY.
--   * Plain ADD CONSTRAINT: validates history too, but aborts the migration if
--     even one legacy row is contradictory.
--   * ADD CONSTRAINT ... NOT VALID: always succeeds and fully constrains every
--     future INSERT and UPDATE, but leaves existing rows unverified. The
--     constraint is then not a statement about the table, only about writes to
--     it — and a reader cannot tell the difference from the catalog alone.
--
-- Rather than choose blind, the block below counts the violating rows first:
--   * none (the expected case)  -> add it VALIDATED, so the constraint is a
--                                  true statement about the whole table.
--   * some (the surprise case)  -> add it NOT VALID so the migration still
--                                  completes and all future writes are
--                                  protected, and RAISE A WARNING naming the
--                                  exact number of contradictory rows so the
--                                  operator learns about them instead of the
--                                  migration dying halfway through.
-- Either way the operator ends up with a protected table and an accurate
-- message, which is the outcome that matters at 2am.

DO $$
DECLARE
  bad_rows BIGINT;
BEGIN
  ALTER TABLE app_invoices
    DROP CONSTRAINT IF EXISTS app_invoices_reverse_charge_determination_check;

  SELECT count(*) INTO bad_rows
    FROM app_invoices
   WHERE reverse_charge = true
     AND vat_determination_status IN ('UNDETERMINED', 'AUTOMATIC_TAX_DISABLED');

  IF bad_rows = 0 THEN
    ALTER TABLE app_invoices
      ADD CONSTRAINT app_invoices_reverse_charge_determination_check
      CHECK (
        reverse_charge = false
        OR vat_determination_status NOT IN ('UNDETERMINED', 'AUTOMATIC_TAX_DISABLED')
      );
    RAISE NOTICE
      'app_invoices_reverse_charge_determination_check added and VALIDATED (0 pre-existing violations).';
  ELSE
    ALTER TABLE app_invoices
      ADD CONSTRAINT app_invoices_reverse_charge_determination_check
      CHECK (
        reverse_charge = false
        OR vat_determination_status NOT IN ('UNDETERMINED', 'AUTOMATIC_TAX_DISABLED')
      )
      NOT VALID;
    RAISE WARNING
      'app_invoices has % row(s) asserting reverse_charge = true with no determination. '
      'The constraint was added NOT VALID so this migration completes and all FUTURE writes '
      'are protected, but those rows remain and are fiscally contradictory. Investigate them, '
      'then run: ALTER TABLE app_invoices VALIDATE CONSTRAINT '
      'app_invoices_reverse_charge_determination_check;',
      bad_rows;
  END IF;
END $$;

COMMENT ON CONSTRAINT app_invoices_reverse_charge_determination_check ON app_invoices IS
  'reverse_charge = true is an AFFIRMATIVE FISCAL CLAIM and may only coexist with a status '
  'representing a real determination (AUTOMATIC_TAX or MANUAL_REVIEW). It can never be true '
  'while the status is UNDETERMINED or AUTOMATIC_TAX_DISABLED, because that combination '
  'asserts a liability shift while simultaneously recording that nothing was determined. '
  'Note the converse is NOT constrained and must not be: reverse_charge = false is valid '
  'under every status, but under an undetermined one it means "we do not know", NEVER '
  '"domestic VAT applies".';

COMMENT ON COLUMN app_invoices.vat_determination_status IS
  'Honest statement about our KNOWLEDGE, not a fiscal position. AUTOMATIC_TAX_DISABLED '
  'means vat_cents = 0 because no calculation ran, not because tax was determined to be '
  'zero. Determination logic is deferred to PB-MARKET-TAX-001.';
COMMENT ON COLUMN app_invoices.reverse_charge IS
  'AFFIRMATIVE FISCAL CLAIM. May only be true on POSITIVE EVIDENCE: a validated business '
  'VAT number plus a B2B determination. It was previously being INFERRED from tax = 0, '
  'which with automatic_tax off marked every non-Estonian customer, consumers included. '
  'Never infer it. false is the conservative absence of a claim, not a claim of domesticity.';
COMMENT ON COLUMN app_invoices.customer_country_evidence IS
  'Raw location inputs observed at invoice time, so a correct determination stays '
  'possible later instead of being reconstructed from nothing.';
COMMENT ON COLUMN app_invoices.automatic_tax_enabled IS
  'Whether Stripe Tax actually ran for this invoice. Without it, vat_cents = 0 is ambiguous.';


-- =============================================================================
-- 4. Row Level Security + GRANTS
-- =============================================================================
-- TWO LAYERS, BOTH REQUIRED. PB-SEC-RLS-WORKFORCE-001 was caused by policies
-- existing without matching table grants: PostgREST answered 401/403 and the
-- policy was never even evaluated. Every policy below therefore has an explicit
-- GRANT to match, and every absent policy has an absent grant to match.
--
-- service_role bypasses RLS entirely and needs no policy. It is the only writer.

ALTER TABLE app_marketplace_revenue_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mre_instructor_select ON app_marketplace_revenue_events;
DROP POLICY IF EXISTS mre_admin_select      ON app_marketplace_revenue_events;

-- 4.1 SELECT — an instructor sees only their own events; admins see all.
--
-- WARNING — RLS FILTERS ROWS, NOT COLUMNS. This policy grants the instructor
-- the WHOLE ROW of their own events, raw_payload and buyer_* included. That
-- violates the hard GDPR rule that instructors receive no student personal
-- data. The base-table grant is therefore NOT the instructor surface: section 5
-- creates app_marketplace_revenue_events_instructor, which omits those columns
-- entirely, and that view is what instructor-facing code must query.
--
-- This policy exists so the view (security_invoker) resolves for its owner. Do
-- not build an instructor UI against the base table.
CREATE POLICY mre_instructor_select
  ON app_marketplace_revenue_events
  FOR SELECT TO authenticated
  USING (
    app_is_admin()
    OR EXISTS (
      SELECT 1
        FROM app_marketplace_instructors i
       WHERE i.id = app_marketplace_revenue_events.instructor_id
         AND i.user_id = auth.uid()
    )
  );

-- 4.2 NO INSERT POLICY. NO UPDATE POLICY. NO DELETE POLICY. INTENTIONAL.
--
-- This is how append-only is enforced. Their absence is the mechanism, not an
-- oversight, so it is stated explicitly here: anyone adding an UPDATE or DELETE
-- policy to this table is breaking the guarantee the table exists to provide.
-- Writes come exclusively from the stripe-webhook Edge Function running as
-- service_role. A correction is a new 'ADJUSTMENT' event, never an edit.

-- 4.3 GRANTS. SELECT only, authenticated only. anon gets nothing at all: these
-- rows are financial and personal data.
REVOKE ALL ON app_marketplace_revenue_events FROM anon;
REVOKE ALL ON app_marketplace_revenue_events FROM authenticated;
GRANT SELECT ON app_marketplace_revenue_events TO authenticated;


-- =============================================================================
-- 5. Instructor-facing view — NO STUDENT PERSONAL DATA
-- =============================================================================
-- The product spec's hard GDPR rule: an instructor receives no student personal
-- data. Postgres RLS cannot express "every column except raw_payload", so the
-- protection is structural, exactly as it is for iban in 004 section 8: the
-- sensitive columns are not in the view's select list, so no query through the
-- view can reach them.
--
-- OMITTED ON PURPOSE, DO NOT ADD: raw_payload, buyer_country,
-- buyer_country_evidence, buyer_vat_number, buyer_is_business, order_id.
-- order_id is omitted too because it joins straight back to app_orders.user_id,
-- which re-identifies the student — a column can leak personal data by
-- reference without containing any.
--
-- Note what the view still contains: only the instructor's own economic facts.
-- It contains NO computed earnings, because no definition of earnings exists
-- yet. Do not add one here either — a view is just as capable of baking in an
-- NCR definition as a column is.
--
-- security_invoker = true so the caller's RLS applies and the view cannot
-- become a privilege-escalation hole. Requires Postgres 15+; Supabase is 15+.

CREATE OR REPLACE VIEW app_marketplace_revenue_events_instructor
WITH (security_invoker = true) AS
  SELECT
    e.id,
    e.course_id,
    e.instructor_id,
    e.event_type,
    e.occurred_at,
    e.currency,
    e.gross_amount_cents,
    e.tax_amount_cents,
    e.discount_amount_cents,
    e.stripe_fee_cents,
    e.net_settled_cents,
    e.coupon_code,
    e.discount_funded_by,
    e.instructor_tier_at_event,
    e.acquisition_channel,
    e.created_at
  FROM app_marketplace_revenue_events e;

COMMENT ON VIEW app_marketplace_revenue_events_instructor IS
  'Instructor-safe projection of app_marketplace_revenue_events. Deliberately omits '
  'raw_payload, buyer_country, buyer_country_evidence, buyer_vat_number, '
  'buyer_is_business and order_id: instructors receive no student personal data, and '
  'order_id re-identifies the student by join. Contains no computed earnings — the NCR '
  'definition is still open (PB-MARKET-TAX-001). security_invoker = true, so the base '
  'table RLS still restricts rows to the instructor''s own events.';

GRANT SELECT ON app_marketplace_revenue_events_instructor TO authenticated;


-- =============================================================================
-- 6. Verification
-- =============================================================================
-- Run after applying.

-- Expected: 1 row, rowsecurity = true.
-- SELECT tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename = 'app_marketplace_revenue_events';

-- CRITICAL — Expected: exactly ONE policy, cmd = 'SELECT'. Any row with
-- cmd IN ('UPDATE','DELETE','INSERT','ALL') means append-only has been broken.
-- SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename = 'app_marketplace_revenue_events'
--  ORDER BY policyname;

-- CRITICAL — Expected: authenticated holds SELECT and ONLY SELECT; anon holds
-- nothing. This is the second half of the append-only guarantee.
-- SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_schema = 'public'
--    AND table_name = 'app_marketplace_revenue_events'
--    AND grantee IN ('anon', 'authenticated')
--  ORDER BY grantee, privilege_type;

-- CRITICAL — Expected: 0 rows. NO GENERATED COLUMN may exist on this table; a
-- generated column is by definition a function of other columns, i.e. exactly
-- the derived value this table forbids.
-- SELECT column_name, generation_expression
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'app_marketplace_revenue_events'
--    AND is_generated = 'ALWAYS';

-- CRITICAL — Expected: 0 rows. No derived-revenue column name has crept in.
-- SELECT column_name
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'app_marketplace_revenue_events'
--    AND (column_name LIKE '%net_course_revenue%'
--      OR column_name LIKE '%instructor_share%'
--      OR column_name LIKE '%platform_fee%'
--      OR column_name LIKE '%take_rate%'
--      OR column_name LIKE '%revenue_split%'
--      OR column_name LIKE '%percentage%');

-- Expected: the 7 new columns exist on app_orders, all nullable.
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'app_orders'
--    AND column_name IN ('course_id','instructor_id','instructor_tier_at_sale',
--                        'acquisition_channel','referral_code','referring_user_id',
--                        'refunded_amount_cents')
--  ORDER BY column_name;

-- Expected: the status CHECK now admits 'disputed' and 'chargeback'.
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'app_orders'::regclass
--    AND conname = 'app_orders_status_check';

-- Expected: the 4 new columns exist on app_invoices.
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'app_invoices'
--    AND column_name IN ('vat_determination_status','customer_country_evidence',
--                        'customer_vat_number_status','automatic_tax_enabled')
--  ORDER BY column_name;

-- Expected: 0 rows. No invoice asserts reverse charge without a customer VAT
-- number on file. This is the regression test for the inference defect.
-- SELECT id, stripe_invoice_id, customer_country, reverse_charge, vat_determination_status
--   FROM app_invoices
--  WHERE reverse_charge = true
--    AND (customer_vat_id IS NULL OR customer_vat_id = '');

-- Expected: 0 rows. A duplicate stripe_event_id means idempotency failed.
-- SELECT stripe_event_id, count(*)
--   FROM app_marketplace_revenue_events
--  WHERE stripe_event_id IS NOT NULL
--  GROUP BY 1 HAVING count(*) > 1;


-- =============================================================================
-- 7. HOW TO APPLY — for the operator
-- =============================================================================
-- THIS FILE HAS NOT BEEN EXECUTED. There is no Postgres in the authoring
-- environment; the SQL has only been reviewed by eye. It must be applied by the
-- operator against the canonical Supabase project (mwdauubztjxkbrefirbg).
--
-- ORDER MATTERS:
--   1. sql/004-marketplace-schema.sql   (still UNAPPLIED — creates
--      app_marketplace_instructors, which section 1.1 and section 2 reference)
--   2. sql/005-revenue-events.sql       (this file)
-- Running this file first fails on the missing table, cleanly and with no
-- partial effect, because each DO block is atomic.
--
-- Option A — Supabase SQL editor: paste and run.
-- Option B — psql:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f /workspace/PIPINGBOX-BRAIN/DASHBOARD-APP/sql/005-revenue-events.sql
--
-- FRONTEND DEPLOYMENT ORDER — safe in either direction for this migration.
-- No frontend component queries app_marketplace_revenue_events; the table name
-- is registered in TABLES purely so that future call sites do not hardcode it.
-- The stripe-webhook Edge Function writes to it, and its writes are wrapped so
-- that a missing table logs and continues rather than failing the payment.
--
-- After applying, run section 6 and confirm in particular that the events table
-- has exactly one policy and that it is a SELECT.


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DESTROYS THE EVENT LOG. These facts are only re-derivable from Stripe within
-- its retention window, and some (instructor tier at sale, acquisition channel,
-- referral attribution) are not in Stripe at all and are gone permanently.
-- Export before running this anywhere that has processed a real payment.
--
-- DROP VIEW IF EXISTS app_marketplace_revenue_events_instructor;
-- DROP TABLE IF EXISTS app_marketplace_revenue_events;
--
-- ALTER TABLE app_invoices DROP CONSTRAINT IF EXISTS app_invoices_customer_vat_number_status_check;
-- ALTER TABLE app_invoices DROP CONSTRAINT IF EXISTS app_invoices_vat_determination_status_check;
-- ALTER TABLE app_invoices DROP COLUMN IF EXISTS automatic_tax_enabled;
-- ALTER TABLE app_invoices DROP COLUMN IF EXISTS customer_vat_number_status;
-- ALTER TABLE app_invoices DROP COLUMN IF EXISTS customer_country_evidence;
-- ALTER TABLE app_invoices DROP COLUMN IF EXISTS vat_determination_status;
--
-- ALTER TABLE app_orders DROP CONSTRAINT IF EXISTS app_orders_referring_user_fk;
-- ALTER TABLE app_orders DROP CONSTRAINT IF EXISTS app_orders_instructor_fk;
-- ALTER TABLE app_orders DROP CONSTRAINT IF EXISTS app_orders_course_fk;
-- ALTER TABLE app_orders DROP COLUMN IF EXISTS refunded_amount_cents;
-- ALTER TABLE app_orders DROP COLUMN IF EXISTS referring_user_id;
-- ALTER TABLE app_orders DROP COLUMN IF EXISTS referral_code;
-- ALTER TABLE app_orders DROP COLUMN IF EXISTS acquisition_channel;
-- ALTER TABLE app_orders DROP COLUMN IF EXISTS instructor_tier_at_sale;
-- ALTER TABLE app_orders DROP COLUMN IF EXISTS instructor_id;
-- ALTER TABLE app_orders DROP COLUMN IF EXISTS course_id;
--
-- Restore the original 003 status CHECK. NOTE: this fails if any row is
-- currently 'disputed' or 'chargeback' — resolve those rows first, and be aware
-- that collapsing them back into 'refunded' loses the distinction permanently.
-- ALTER TABLE app_orders DROP CONSTRAINT IF EXISTS app_orders_status_check;
-- ALTER TABLE app_orders
--   ADD CONSTRAINT app_orders_status_check
--   CHECK (status IN ('pending', 'paid', 'refunded', 'failed'));
