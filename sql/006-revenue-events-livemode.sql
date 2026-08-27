-- =============================================================================
-- PB-MARKET-REVENUE-LIVEMODE-001: record whether the money was real
-- =============================================================================
--
-- PURPOSE:
-- app_marketplace_revenue_events records what Stripe reported about every sale,
-- refund and chargeback. It does not record the single fact that says whether
-- any of it was REAL: Stripe's `livemode` flag. Every Stripe event object
-- carries it, on every API version, and today we throw it away.
--
-- THE CONCRETE PROBLEM THIS FIXES:
-- The Product Owner needs to run a Stripe TEST-MODE SALE -> REFUND -> DISPUTE
-- against the deployed webhook to confirm the pipeline works end to end. With
-- the schema as it stands, those three rows land in the production revenue
-- ledger PERMANENTLY INDISTINGUISHABLE FROM REAL REVENUE AT THE COLUMN LEVEL.
-- There is no column to filter on. `SELECT sum(gross_amount_cents) FROM
-- app_marketplace_revenue_events` silently includes the test transaction, and
-- so does every report built on top of it.
--
-- WHY "IT IS IN raw_payload" IS NOT AN ANSWER:
-- The flag technically survives inside the stored Stripe object, so the
-- information is not lost. But recoverable-in-principle is not the same as
-- usable: it means every financial aggregation, forever, must remember to write
--
--   WHERE (raw_payload ->> 'livemode')::boolean IS DISTINCT FROM false
--
-- and must remember WHY. That is precisely the kind of institutional memory
-- that does not survive a year, a handover or a new analyst. The failure mode
-- is not an error message — it is a P&L with a wrong number in it, produced
-- long after anyone remembers a test was ever run. A JSONB extraction is also
-- unindexed, un-typed and un-constrained: the database cannot help you get it
-- right, and cannot tell you when you got it wrong.
--
-- WHY THIS IS URGENT RATHER THAN MERELY UNTIDY — APPEND-ONLY:
-- app_marketplace_revenue_events has NO UPDATE and NO DELETE policy, by
-- construction (005 section 4.2). Rows written into it CANNOT BE CORRECTED AND
-- CANNOT BE REMOVED. This is the PB-SEC-RLS-WORKFORCE-001 lesson in a harsher
-- form: there, junk RLS-TEST rows accumulated in commercial tables and could in
-- principle be purged, and a CI job now does exactly that. Here purging is not
-- available even in principle. A test-mode row written before this column
-- exists is unmarkable FOREVER at the column level.
--
-- Therefore this migration BLOCKS the Stripe test-mode verification. Running
-- that test first would create exactly the rows this file exists to prevent.
-- See scripts/verify-stripe-revenue-events.md, which restates this as a
-- precondition.
--
-- CONSISTENT WITH THE GOVERNING PRINCIPLE — RECORD FACTS, NEVER DERIVE:
-- `livemode` is a fact Stripe reports, transcribed unchanged. It is not
-- computed from any other column, it is not an interpretation, and it takes no
-- position on the still-open Net Course Revenue question (PB-MARKET-TAX-001).
-- It is the same category of column as stripe_fee_cents: a number Stripe
-- reported, written down. This is the correct fix, not a workaround for one.
--
-- SCOPE:
-- Creates no table. Adds ONE column to ONE table, plus one partial index:
--   app_marketplace_revenue_events.livemode  BOOLEAN, NULLABLE, NO DEFAULT
--   idx_app_marketplace_revenue_events_livemode_true  (partial)
-- Adds two COMMENTs. Nothing else is touched.
--
-- EXPLICITLY NOT DONE — and each of these is a deliberate refusal:
--   * No UPDATE and no DELETE policy is added. Append-only is not weakened in
--     any way. Historical rows are NOT back-filled, because a back-fill would
--     be an invention (see the nullability argument below).
--   * No derived column. No Net Course Revenue, no split, no platform fee, no
--     percentage, no balance, no payout. 005's prohibition stands unchanged.
--   * The Founding Instructor cap, the revenue-split channels and every
--     004/005 constraint are untouched.
--   * No NOT NULL is added to the existing column set, now or later by a
--     follow-up: see "WHY NOT NOT NULL LATER" below.
--
-- WHY THIS IS A NEW FILE AND NOT AN EDIT TO 005:
-- sql/004-marketplace-schema.sql and sql/005-revenue-events.sql HAVE BEEN
-- APPLIED to the canonical Supabase project (mwdauubztjxkbrefirbg) and
-- verified. An applied migration is history. Editing it in place would mean the
-- file in the repository no longer describes what is actually in the database,
-- and anyone re-running it on a fresh environment would get a different schema
-- from production. Forward-only migration is the only correct mechanism now.
--
-- DEPENDS ON:
--   sql/004-marketplace-schema.sql  (APPLIED)
--   sql/005-revenue-events.sql      (APPLIED — creates the table this alters)
-- Running this file before 005 fails cleanly on the missing table, with no
-- partial effect.
--
-- REVERSIBLE:
-- YES — see the ROLLBACK section. Note the asymmetry: dropping the column
-- destroys the livemode observation for every row written while it existed, and
-- because the table is append-only those observations cannot be re-recorded.
-- They would have to be re-read from raw_payload, which is possible but is
-- exactly the archaeology this migration exists to abolish.
--
-- IDEMPOTENT:
-- YES — ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, COMMENT is
-- inherently idempotent. Safe to re-run any number of times. Verified by
-- running this file twice in succession against a scratch database.
--
-- STATUS: NOT APPLIED. Tested against a local PostgreSQL 16.4 with the stub
-- fixtures in sql/test-fixtures/ (004 -> 005 -> 006, then 006 again). It must
-- be applied to Supabase by the operator. See section 4.
-- =============================================================================


-- =============================================================================
-- 1. The column
-- =============================================================================
--
-- ############################################################################
-- #  NULLABLE, WITH NO DEFAULT. THIS IS THE CENTRAL DECISION IN THIS FILE.   #
-- ############################################################################
--
-- THREE-STATE, exactly like buyer_is_business in 005:
--   true  = Stripe reported livemode:true  -> REAL MONEY. Observed.
--   false = Stripe reported livemode:false -> TEST MODE.  Observed.
--   NULL  = the row was written before this column existed -> UNKNOWN at the
--           column level. NOT observed, and deliberately not guessed.
--
-- WHY NOT DEFAULT true:
-- A default applies to rows nobody classified. Writing `true` would make the
-- database ASSERT "this was real money" about every historical row on no
-- evidence whatsoever. That is a fabricated fact in a table whose entire
-- purpose is to hold only observed ones, and it is fabricated in the direction
-- that OVERSTATES revenue — the worse direction, and the one an auditor is
-- least forgiving about. It would also be indistinguishable, forever, from a
-- genuine observation of true.
--
-- WHY NOT DEFAULT false:
-- Worse. It would silently reclassify every real historical sale as test data
-- and quietly delete it from every "real revenue only" aggregation. The
-- partial index below makes that failure fast and total: real revenue would
-- simply vanish from reports with no error anywhere.
--
-- WHY NOT BACK-FILL FROM raw_payload:
-- Tempting, and rejected. It is only correct for rows whose payload actually
-- carries the key; where it does not, the UPDATE either writes a guess or
-- leaves the row NULL anyway, and afterwards nobody can tell which rows were
-- observed and which were reconstructed. It also requires an UPDATE against an
-- append-only ledger, normalising exactly the operation 005 forbids. The
-- ROLLBACK/back-fill query is provided in section 5 as a READ-ONLY diagnostic
-- so the operator can SEE what the payloads say, without writing it down as
-- though the column had observed it.
--
-- THE COUNTER-ARGUMENT, STATED HONESTLY:
-- A nullable column gets forgotten in filters. `WHERE livemode = true` silently
-- drops every historical NULL row, which is a real and serious failure mode —
-- an analyst writing the obvious query would under-report historical revenue.
-- This is the strongest argument for NOT NULL DEFAULT true, and it is not a
-- weak one.
--
-- WHY NULLABLE STILL WINS:
--   1. The two failure modes are not symmetric. A forgotten filter produces a
--      number that is visibly, arguably wrong and can be investigated, because
--      the NULLs are still there to be found. A fabricated `true` produces a
--      number that is invisibly wrong and can never be investigated, because
--      the evidence that it was fabricated has been overwritten by the default.
--      Append-only makes the second permanent.
--   2. NULL is TRUE about the world. Those rows genuinely have unknown
--      provenance at the column level. The table's contract is observed facts;
--      a default breaks that contract on its first day.
--   3. The forgetting risk is mitigable and is mitigated here. The partial
--      index below makes the correct predicate the fast, obvious and documented
--      one, and scripts/check-schema-guard.mjs now knows the column exists.
--      The fabrication risk is not mitigable by anything at all.
--   4. Precedent: 005 already made this exact call for buyer_is_business, for
--      the same reason, and stated it in a COMMENT. A different answer to the
--      same question in the same table would be the inconsistency.
--
-- THE CORRECT PREDICATE, AND WHY IT IS NOT `= true`:
--   real revenue -> WHERE livemode IS DISTINCT FROM false
--   test data    -> WHERE livemode = false
-- `IS DISTINCT FROM false` keeps both observed-real rows and unknown-provenance
-- historical rows, and excludes only rows OBSERVED to be test. That is the
-- honest reading: the ledger predates the flag, and the only thing it can
-- truthfully assert is which rows were seen to be tests.
--
-- WHY NOT NOT NULL LATER:
-- Do not "finish the job" with a later SET NOT NULL. It would require
-- back-filling the NULLs first, which means inventing the values this file
-- refused to invent. The NULLs are permanent and correct: they mark the era
-- before the observation existed. A future migration may add NOT NULL only if
-- it also restricts it to rows created after this migration — which a CHECK
-- cannot express against created_at without freezing a timestamp into the
-- schema, and is not worth it.

ALTER TABLE app_marketplace_revenue_events
  ADD COLUMN IF NOT EXISTS livemode BOOLEAN;

COMMENT ON COLUMN app_marketplace_revenue_events.livemode IS
  'Stripe''s livemode flag, transcribed unchanged from the event object. An OBSERVED '
  'FACT, never derived. THREE-STATE: true = real money, false = Stripe test mode, '
  'NULL = row written before this column existed, provenance unknown at the column '
  'level. DELIBERATELY NULLABLE WITH NO DEFAULT: defaulting to true would assert "real '
  'money" about historical rows on no evidence and overstate revenue, defaulting to '
  'false would reclassify real revenue as test data and silently delete it from every '
  'report. The table is APPEND-ONLY, so either mistake would be permanent. Real-revenue '
  'queries must use "livemode IS DISTINCT FROM false", NOT "livemode = true", which '
  'would drop every historical row. Test-mode rows cannot be deleted; livemode = false '
  'is what makes them cheaply and permanently excludable.';


-- =============================================================================
-- 2. Partial index — "real revenue only" is the near-universal query
-- =============================================================================
-- Every financial aggregation filters on this: revenue reports, instructor
-- statements, the future Net Course Revenue computation, any reconciliation
-- against Stripe. It is the default predicate of the whole table, so it gets
-- an index rather than a sequential scan that grows forever.
--
-- WHY PARTIAL RATHER THAN A PLAIN INDEX ON (livemode):
-- Test-mode rows are a permanent tiny minority — a handful of verification
-- runs against a ledger that accumulates every real sale forever. A full index
-- would spend almost all of its size indexing the value that is never selected
-- for. The partial index stores ONLY the rows the common query wants, so it
-- stays small, stays hot in cache, and the planner can use it as a covering
-- filter.
--
-- WHY THE PREDICATE IS `IS DISTINCT FROM false` AND NOT `= true`:
-- This is the same distinction as in section 1, and here it has teeth. Postgres
-- only uses a partial index when it can prove the query predicate implies the
-- index predicate. Indexing `WHERE livemode = true` would EXCLUDE every
-- historical NULL row, so the index would not just be slower for the honest
-- query — it would be unusable for it, and would quietly encourage the wrong
-- predicate to be written in order to hit the index. The index is deliberately
-- shaped so that the CORRECT query is the fast one.
--
-- The occurred_at key inside the partial set serves the period-bounded form
-- these queries almost always take ("real revenue for August"), turning the
-- common case into a single bounded index scan.

CREATE INDEX IF NOT EXISTS idx_app_marketplace_revenue_events_livemode_true
  ON app_marketplace_revenue_events (occurred_at)
  WHERE livemode IS DISTINCT FROM false;

COMMENT ON INDEX idx_app_marketplace_revenue_events_livemode_true IS
  'Supports the near-universal "real revenue only" query. Partial on '
  '"livemode IS DISTINCT FROM false" so that real rows AND pre-livemode historical rows '
  'are included and only OBSERVED test-mode rows are excluded. Deliberately not '
  '"livemode = true": that would exclude every historical NULL and would reward writing '
  'the wrong predicate to hit the index. Keyed on occurred_at because these aggregations '
  'are almost always period-bounded.';


-- =============================================================================
-- 3. app_orders — CONSIDERED, AND DELIBERATELY NOT CHANGED
-- =============================================================================
-- The question was whether app_orders should get the same livemode column for
-- consistency. It should not, for four reasons, and the decision is recorded
-- here so it is not silently revisited.
--
-- 1. THE HARM THIS MIGRATION PREVENTS DOES NOT EXIST THERE. The danger is a
--    test row that is permanently unmarkable and silently included in a
--    financial total. app_orders is NOT append-only: it has UPDATE policies, it
--    is mutated on every status transition, and a test order can simply be
--    deleted by an operator. Nothing about a test order is permanent, so
--    nothing about it is unfixable.
--
-- 2. app_orders IS NOT THE REVENUE LEDGER. Financial aggregation reads
--    app_marketplace_revenue_events — that is why 005 created it. Marking the
--    ledger is what makes the reports correct. Marking the order table as well
--    would add a second place to filter, which is a second place to forget, and
--    two flags that can disagree is strictly worse than one that cannot.
--
-- 3. THE LINK ALREADY EXISTS. app_marketplace_revenue_events.order_id joins
--    straight back, so a test order is identifiable today:
--      SELECT o.* FROM app_orders o
--        JOIN app_marketplace_revenue_events e ON e.order_id = o.id
--       WHERE e.livemode = false;
--    Duplicating a fact that is already reachable is how the two copies start
--    disagreeing.
--
-- 4. IT WOULD NOT BE FREE. app_orders is written by create-checkout and by
--    several webhook paths; adding a column there means touching every one of
--    them, and any path that forgot it would write a NULL that looks exactly
--    like a pre-migration row. The blast radius is larger than the problem.
--
-- IF THIS IS EVER REVISITED, the trigger should be a concrete need — e.g.
-- app_orders becoming a reporting source in its own right — and it should be
-- its own forward migration with its own argument, not consistency for its own
-- sake. "Consistency" is not a reason to add a column that nothing reads.
--
-- app_invoices is likewise untouched, and more strongly so: 005 section 3
-- established that the platform has never issued a live invoice, so the table
-- is expected to be empty and has no historical ambiguity to resolve.


-- =============================================================================
-- 4. HOW TO APPLY — for the operator
-- =============================================================================
-- ORDER MATTERS. 004 and 005 are ALREADY APPLIED to mwdauubztjxkbrefirbg, so on
-- that database this file is the only one to run. On a FRESH environment the
-- order is:
--   1. sql/004-marketplace-schema.sql
--   2. sql/005-revenue-events.sql
--   3. sql/006-revenue-events-livemode.sql   (this file)
--
-- NOTE THE FILENAME COLLISION documented in sql/VERIFY-004-005.md: there are
-- two files starting with 004- and two starting with 005-. The ones meant here
-- are 004-marketplace-schema.sql and 005-revenue-events.sql, NOT
-- 004-certification-consent-grants.sql or 005-cancel-ghost-job-applications.sql.
-- There is only one 006-.
--
-- Option A — Supabase SQL editor: paste and run.
-- Option B — psql:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f /workspace/PIPINGBOX-BRAIN/DASHBOARD-APP/sql/006-revenue-events-livemode.sql
--
-- LOCKING: ADD COLUMN with no default and no NOT NULL is a catalog-only change
-- in Postgres 11+ — it does not rewrite the table and takes an ACCESS EXCLUSIVE
-- lock only for an instant. CREATE INDEX does take a lock that blocks writes
-- for its duration; on a table this size that is milliseconds. If it ever
-- matters, use CREATE INDEX CONCURRENTLY instead — but note it cannot run
-- inside a transaction block.
--
-- DEPLOYMENT ORDER RELATIVE TO THE WEBHOOK — APPLY THIS FIRST.
-- The Edge Function writes `livemode` on every revenue-event insert. PostgREST
-- rejects the ENTIRE row if a column does not exist (the
-- PB-ADMIN-ONBOARDING-SCHEMA-001 failure mode), so deploying the new webhook
-- before this migration would make every revenue-event insert fail. The webhook
-- swallows that error by design — payments keep working, telemetry is silently
-- lost — which means the breakage would be INVISIBLE. Apply the SQL, verify
-- section 5, then deploy the function.
--
-- BEFORE THE STRIPE TEST-MODE RUN: this file must be applied AND the webhook
-- redeployed. See scripts/verify-stripe-revenue-events.md.


-- =============================================================================
-- 5. Verification
-- =============================================================================
-- Run after applying.

-- Expected: exactly 1 row — livemode | boolean | YES | (null default).
-- is_nullable MUST be YES and column_default MUST be NULL. Anything else means
-- a default crept in and the fabricated-fact problem in section 1 is now live.
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'app_marketplace_revenue_events'
--    AND column_name = 'livemode';

-- Expected: 1 row, the partial index, with the predicate visible in the
-- definition as "WHERE (livemode IS DISTINCT FROM false)".
-- SELECT indexname, indexdef
--   FROM pg_indexes
--  WHERE schemaname = 'public'
--    AND tablename = 'app_marketplace_revenue_events'
--    AND indexname = 'idx_app_marketplace_revenue_events_livemode_true';

-- CRITICAL — APPEND-ONLY MUST STILL HOLD. Expected: exactly ONE policy, with
-- cmd = 'SELECT'. Any row with cmd IN ('INSERT','UPDATE','DELETE','ALL') means
-- this migration, or something after it, broke the guarantee.
-- SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename = 'app_marketplace_revenue_events'
--  ORDER BY policyname;

-- CRITICAL — Expected: authenticated holds SELECT and ONLY SELECT; anon holds
-- nothing. The second half of the append-only guarantee, unchanged by this file.
-- SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_schema = 'public'
--    AND table_name = 'app_marketplace_revenue_events'
--    AND grantee IN ('anon', 'authenticated')
--  ORDER BY grantee, privilege_type;

-- CRITICAL — Expected: 0 rows. livemode must NOT be a generated column; a
-- generated column is by definition derived, which this table forbids.
-- SELECT column_name, generation_expression
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'app_marketplace_revenue_events'
--    AND is_generated = 'ALWAYS';

-- Provenance census. Before the webhook is redeployed, expect every row to be
-- unknown (NULL). After the Stripe test-mode run, expect exactly the test rows
-- under false. A `true` appearing before a real sale has been processed would
-- mean something is writing a value it did not observe.
-- SELECT COALESCE(livemode::text, 'unknown (pre-006)') AS provenance,
--        count(*) AS rows,
--        COALESCE(sum(gross_amount_cents), 0) AS gross_cents
--   FROM app_marketplace_revenue_events
--  GROUP BY 1
--  ORDER BY 1;

-- THE CANONICAL REAL-REVENUE QUERY. This is the shape every financial
-- aggregation should copy. Note "IS DISTINCT FROM false", not "= true".
-- SELECT count(*) AS events, COALESCE(sum(gross_amount_cents), 0) AS gross_cents
--   FROM app_marketplace_revenue_events
--  WHERE livemode IS DISTINCT FROM false;

-- Confirm the planner actually uses the partial index for that predicate.
-- Expected: an Index Scan on idx_app_marketplace_revenue_events_livemode_true.
-- On a nearly empty table the planner will correctly prefer a seq scan; force
-- it with SET enable_seqscan = off if you want to prove the index is usable.
-- EXPLAIN
-- SELECT sum(gross_amount_cents)
--   FROM app_marketplace_revenue_events
--  WHERE livemode IS DISTINCT FROM false
--    AND occurred_at >= date_trunc('month', now());

-- READ-ONLY DIAGNOSTIC — what do the historical payloads actually say?
-- Deliberately a SELECT and NOT an UPDATE. This lets the operator SEE the
-- provenance of pre-006 rows without recording a reconstruction as though it
-- were an observation. Do not turn this into a back-fill; see section 1.
-- SELECT id, event_type, occurred_at,
--        raw_payload ->> 'livemode' AS livemode_in_payload
--   FROM app_marketplace_revenue_events
--  WHERE livemode IS NULL
--  ORDER BY occurred_at DESC
--  LIMIT 50;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Dropping the column DESTROYS every livemode observation recorded since this
-- migration was applied. Because the table is append-only, those observations
-- cannot be re-recorded — re-adding the column later starts it at NULL for all
-- of them, and the only remaining trace is inside raw_payload. Do not roll this
-- back to "clean up"; the whole point of the column is that this fact must not
-- live only in JSON.
--
-- DROP INDEX IF EXISTS idx_app_marketplace_revenue_events_livemode_true;
-- ALTER TABLE app_marketplace_revenue_events DROP COLUMN IF EXISTS livemode;
