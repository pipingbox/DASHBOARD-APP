-- =============================================================================
-- ####  T E S T   F I X T U R E  —  N O T   P R O D U C T I O N   S Q L  ####
-- =============================================================================
--
--   ######################################################################
--   #   DO NOT RUN THIS FILE AGAINST SUPABASE, STAGING OR PRODUCTION.    #
--   #   It writes fake financial events into the revenue ledger.         #
--   ######################################################################
--
-- PURPOSE:
-- Prove that app_marketplace_revenue_events (sql/005-revenue-events.sql) really
-- accommodates the three event types the operator wants to demonstrate in
-- Stripe test mode — SALE, REFUND and CHARGEBACK — with realistic values,
-- BEFORE the migration reaches production.
--
-- SIGN CONVENTION UNDER TEST: 005 states that refunds and chargebacks carry
-- NEGATIVE amounts so that a period total is a plain SUM with no direction
-- logic. These fixtures follow that convention, so the closing SUM is also a
-- test of whether the convention actually produces the right answer.
-- =============================================================================

BEGIN;

-- --- Supporting rows ---------------------------------------------------------
INSERT INTO auth.users (id, email)
  VALUES ('11111111-1111-1111-1111-111111111111', 'buyer@example.test')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (id, email)
  VALUES ('22222222-2222-2222-2222-222222222222', 'instructor@example.test')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO app_marketplace_instructors (id, user_id, display_name, instructor_status, revenue_share_tier)
  VALUES ('33333333-3333-3333-3333-333333333333',
          '22222222-2222-2222-2222-222222222222',
          'Ana Instructora', 'APPROVED', 'STANDARD')
  ON CONFLICT (id) DO NOTHING;

-- fiscal_nature is NOT NULL with NO DEFAULT on purpose (004 section 3): the
-- classification must be stated explicitly, never assumed by the system.
-- taxonomy_category is a PROVENANCE taxonomy (who made the course), not a
-- subject taxonomy. A third-party instructor course is EXPERT_COURSE; there is
-- deliberately no 'WELDING'-style subject value in that column.
INSERT INTO app_academy_courses (id, title, fiscal_nature, taxonomy_category, verification_status)
  VALUES ('44444444-4444-4444-4444-444444444444',
          'Soldadura TIG avanzada', 'pregrabado', 'EXPERT_COURSE', 'VERIFIED')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO app_orders (id, user_id, amount_cents, currency, status, course_id, instructor_id,
                        instructor_tier_at_sale, acquisition_channel)
  VALUES ('55555555-5555-5555-5555-555555555555',
          '11111111-1111-1111-1111-111111111111',
          14900, 'EUR', 'paid',
          '44444444-4444-4444-4444-444444444444',
          '33333333-3333-3333-3333-333333333333',
          'STANDARD', 'ORGANIC')
  ON CONFLICT (id) DO NOTHING;


-- --- 1. SALE -----------------------------------------------------------------
-- A EUR 149.00 course sale. Stripe fee 2.47 (1.5% + 0.25 EU card), settled
-- 146.53. tax_amount_cents is 0 because automatic_tax is OFF — and per 005 that
-- 0 is "no calculation ran", which is why the honest statement of what we know
-- lives on app_invoices.vat_determination_status, not here.
INSERT INTO app_marketplace_revenue_events
  (order_id, course_id, instructor_id, event_type, occurred_at, currency,
   gross_amount_cents, tax_amount_cents, discount_amount_cents,
   stripe_fee_cents, net_settled_cents,
   buyer_country, buyer_country_evidence, buyer_is_business,
   instructor_tier_at_event, acquisition_channel,
   stripe_event_id, stripe_object_id, raw_payload)
VALUES
  ('55555555-5555-5555-5555-555555555555',
   '44444444-4444-4444-4444-444444444444',
   '33333333-3333-3333-3333-333333333333',
   'SALE', '2026-08-01T10:15:00Z', 'EUR',
   14900, 0, 0, 247, 14653,
   'ES',
   '{"billing_country":"ES","card_country":"ES","payment_method_type":"card","source":"stripe.charge","observed_at":"2026-08-01T10:15:00Z"}'::jsonb,
   NULL,                       -- three-state: nobody asked, so it stays unknown
   'STANDARD', 'ORGANIC',
   'evt_test_sale_0001', 'ch_test_0001',
   '{"id":"ch_test_0001","object":"charge","amount":14900,"currency":"eur"}'::jsonb);


-- --- 2. REFUND ---------------------------------------------------------------
-- Full refund of the same order. NEGATIVE amounts per the sign convention.
-- Stripe does NOT return the original processing fee on a refund, so the fee
-- is 0 here rather than -247: the platform really did lose that 2.47.
INSERT INTO app_marketplace_revenue_events
  (order_id, course_id, instructor_id, event_type, occurred_at, currency,
   gross_amount_cents, tax_amount_cents, stripe_fee_cents, net_settled_cents,
   buyer_country, instructor_tier_at_event, acquisition_channel,
   stripe_event_id, stripe_object_id, raw_payload)
VALUES
  ('55555555-5555-5555-5555-555555555555',
   '44444444-4444-4444-4444-444444444444',
   '33333333-3333-3333-3333-333333333333',
   'REFUND', '2026-08-05T09:00:00Z', 'EUR',
   -14900, 0, 0, -14900,
   'ES', 'STANDARD', 'ORGANIC',
   'evt_test_refund_0001', 're_test_0001',
   '{"id":"re_test_0001","object":"refund","amount":14900,"currency":"eur","reason":"requested_by_customer"}'::jsonb);


-- --- 3. CHARGEBACK -----------------------------------------------------------
-- A disputed EUR 89.00 sale on a second order. The disputed amount AND the
-- EUR 15.00 dispute fee both leave the account: -8900 gross, -1500 fee,
-- -10400 actually settled. CHARGEBACK and CHARGEBACK_REVERSAL are separate
-- event types in 005 precisely so that winning the dispute later reverses this
-- rather than erasing the fact that it happened.
INSERT INTO app_orders (id, user_id, amount_cents, currency, status, course_id, instructor_id)
  VALUES ('66666666-6666-6666-6666-666666666666',
          '11111111-1111-1111-1111-111111111111',
          8900, 'EUR', 'paid',
          '44444444-4444-4444-4444-444444444444',
          '33333333-3333-3333-3333-333333333333')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO app_marketplace_revenue_events
  (order_id, course_id, instructor_id, event_type, occurred_at, currency,
   gross_amount_cents, tax_amount_cents, stripe_fee_cents, net_settled_cents,
   buyer_country, buyer_is_business, instructor_tier_at_event, acquisition_channel,
   stripe_event_id, stripe_object_id, raw_payload)
VALUES
  ('66666666-6666-6666-6666-666666666666',
   '44444444-4444-4444-4444-444444444444',
   '33333333-3333-3333-3333-333333333333',
   'CHARGEBACK', '2026-08-11T16:42:00Z', 'EUR',
   -8900, 0, -1500, -10400,
   'PT', false, 'STANDARD', 'PARTNER',
   'evt_test_chargeback_0001', 'dp_test_0001',
   '{"id":"dp_test_0001","object":"dispute","amount":8900,"currency":"eur","reason":"fraudulent","status":"lost"}'::jsonb);

COMMIT;
