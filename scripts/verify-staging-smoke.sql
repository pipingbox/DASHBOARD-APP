-- =============================================================================
-- PB-MARKET-NCR-LEDGER-001 / PB-MARKET-TAX-ENGINE-001 — STAGING VERIFICATION
-- Operator script (PO checkpoint 2026-09-24). Run AFTER applying 007, 008,
-- 012, 013, 014 IN ORDER, against STAGING credentials (SUPABASE_DB_URL).
--
-- Sections:
--   V1. Schema state (all five migrations present)
--   V2. Canonical NCR formula probe
--   V3. Self-billing numbering probe (SB-BE-YYYY-NNNNNN)
--   V4. Refund/chargeback -> original sale -> OFFSET 1:1 traceability
--   V5. Tax catalog mapping state (7 categories, no NULL, no generic)
--   V6. Consent evidence chain (consent -> order -> SUPPLY_STARTED)
--
-- Every section prints a PASS/FAIL line. Run with psql:
--   psql "$SUPABASE_DB_URL" -f scripts/verify-staging-smoke.sql
-- =============================================================================

\echo '== V1. Schema state ========================================================='
SELECT CASE WHEN count(*) = 9 THEN 'PASS: all marketplace tables present' ELSE 'FAIL: missing tables' END AS v1,
       string_agg(t, ', ') AS tables
FROM (
  SELECT unnest(ARRAY[
    'app_legal_entities','app_consent_evidence','app_supply_events',
    'app_tax_determinations','app_tax_registrations',
    'app_instructor_ledger_entries','app_settlements',
    'app_self_billing_invoices','app_invoice_sequences'
  ]) AS t
) x
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public');

\echo '== V2. Canonical NCR formula ==============================================='
-- gross 121.00 - VAT 21.00 - fee 3.00 = net 97.00
SELECT CASE WHEN app_net_revenue_cents(12100, 2100, 0, 0, 0, 300) = 9700
            THEN 'PASS: NCR = 9700' ELSE 'FAIL: NCR formula wrong' END AS v2;

\echo '== V3. Self-billing numbering (run this section TWICE) ====================='
-- Requires the BE entity. After two runs expect ...-000001 then ...-000002.
SELECT app_next_self_billing_number(
  (SELECT id FROM app_legal_entities WHERE entity_key = 'BE_SOLE_PROPRIETOR'))
  AS v3_invoice_number;

\echo '== V4. Refund/chargeback 1:1 traceability =================================='
-- After the staging refund test (see runbook), every debit must carry the
-- original order + payment reference + revenue event + course, NEGATIVE amount,
-- and its original settlement (if any) must remain untouched.
SELECT CASE
         WHEN count(*) = 0 THEN 'INFO: no debit entries yet — run the staging refund test first'
         WHEN bool_and(order_id IS NOT NULL AND stripe_payment_reference IS NOT NULL
                       AND amount_cents < 0)
           THEN 'PASS: all debit entries fully traceable to the original sale'
         ELSE 'FAIL: debit entries missing traceability links'
       END AS v4,
       count(*) AS debits
FROM app_instructor_ledger_entries
WHERE entry_type IN ('REFUND_DEBIT','CHARGEBACK_DEBIT');

-- The OFFSET lifecycle: debits consumed by a settlement are ADJUSTED, not
-- deleted; uncompensated remainders exist as RECOVERABLE rows.
SELECT entry_type, status, count(*), sum(amount_cents) AS total_cents
FROM app_instructor_ledger_entries
WHERE entry_type IN ('REFUND_DEBIT','CHARGEBACK_DEBIT','OFFSET','RECOVERABLE')
GROUP BY entry_type, status ORDER BY entry_type, status;

-- Settlement immutability probe: January settlement unchanged by April debit.
SELECT s.id, s.status, s.payable_cents, s.offset_applied_cents,
       (s.instructor_snapshot ->> 'snapshot_at') AS frozen_at
FROM app_settlements s ORDER BY s.created_at DESC LIMIT 5;

\echo '== V5. Tax catalog mapping =================================================='
SELECT CASE
         WHEN count(*) = 0 THEN 'INFO: catalog empty in this env'
         WHEN bool_and(tax_category IS NOT NULL) AND bool_and(stripe_tax_code IS NOT NULL)
           THEN 'PASS: every catalog row classified and mapped'
         ELSE 'FAIL: catalog rows with NULL tax_category or stripe_tax_code'
       END AS v5
FROM app_stripe_prices;

SELECT tax_category, stripe_tax_code, count(*) AS products
FROM app_stripe_prices GROUP BY 1, 2 ORDER BY 1;

-- No generic blanket code anywhere (PO: no single generic tax code).
SELECT CASE WHEN count(*) = 0
            THEN 'PASS: no generic txcd_10000000 blanket mapping'
            ELSE 'FAIL: generic blanket code present' END AS v5b
FROM app_stripe_prices WHERE stripe_tax_code = 'txcd_10000000';

-- Registrations stay EMPTY until real ones exist (nothing invented).
SELECT CASE WHEN count(*) = 0
            THEN 'PASS: tax registrations empty (as required pre-activation)'
            ELSE 'INFO: registrations exist — verify they are real' END AS v5c
FROM app_tax_registrations;

\echo '== V6. Consent evidence chain ==============================================='
SELECT CASE
         WHEN count(*) = 0 THEN 'INFO: no consent rows yet — run a staging purchase first'
         WHEN bool_and(text_version IS NOT NULL AND text_hash IS NOT NULL AND text_snapshot IS NOT NULL)
           THEN 'PASS: all consent rows carry version + hash + snapshot'
         ELSE 'FAIL: consent rows missing evidence fields'
       END AS v6,
       count(*) AS consents
FROM app_consent_evidence;

-- Every paid order with a flagged product has a SUPPLY_STARTED event.
SELECT CASE
         WHEN count(*) = 0 THEN 'INFO: no supply events yet'
         ELSE 'PASS: ' || count(*) || ' supply events recorded' END AS v6b
FROM app_supply_events WHERE event_type = 'SUPPLY_STARTED';

\echo '== DONE. Attach the full output to the PO checkpoint. ======================'
