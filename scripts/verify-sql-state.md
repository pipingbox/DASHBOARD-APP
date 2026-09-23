# Verify SQL state 004/005/006 — PB-OPS-SQLSTATE-001 runbook

> **Why this file exists:** the SQL headers of 004/005/006 say `STATUS: NOT
> APPLIED`, while `PIPINGBOX-BRAIN/06-EXECUTION/TICKETS/INDEX.md` (v4.65.0,
> 2026-08-27) records 004 and 005 as **applied and verified** against the
> canonical Supabase project (`mwdauubztjxkbrefirbg`). 006 is recorded as NOT
> APPLIED. PO rule (2026-09-23): **never assume applied based on tickets or
> documentation — verify against the database.** This runbook is the
> verification. Run it before ANY deploy that writes revenue events.

## 0. Environment

```bash
export SUPABASE_DB_URL='postgresql://postgres:[PASSWORD]@db.mwdauubztjxkbrefirbg.supabase.co:5432/postgres'
# or use the Supabase SQL Editor / `supabase db execute` with equivalent rights.
```

If you do not have credentials: **STOP. Report BLOCKED.** Do not infer state.

## 1. Verify 004 — marketplace schema

Every query must return the expected shape. Run them one by one.

```sql
-- 1.1 Tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'app_marketplace_instructors',
    'app_marketplace_course_reviews',
    'app_marketplace_dsa_notices'
  )
ORDER BY table_name;
-- EXPECT: 3 rows.

-- 1.2 Course columns added (ADD COLUMN IF NOT EXISTS)
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_academy_courses'
  AND column_name IN (
    'instructor_id', 'fiscal_nature', 'taxonomy_category',
    'verification_status', 'verified_at', 'verified_by',
    'submitted_for_review_at', 'revenue_share_channel_default'
  );
-- EXPECT: 8 rows.

-- 1.3 Backfill ran (pre-existing courses are PipingBox Originals)
SELECT fiscal_nature, count(*) FROM app_academy_courses GROUP BY 1;
-- EXPECT: at least one row with fiscal_nature = 'pipingbox_original'
-- (or the exact enum value used by 004; check its backfill section).

-- 1.4 RLS is on
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('app_marketplace_instructors', 'app_marketplace_course_reviews', 'app_marketplace_dsa_notices');
-- EXPECT: relrowsecurity = true for all 3.
```

## 2. Verify 005 — revenue events

```sql
-- 2.1 Table + key columns exist
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'app_marketplace_revenue_events'
  AND column_name IN (
    'event_type', 'gross_amount_cents', 'net_settled_cents',
    'stripe_fee_cents', 'buyer_country_evidence', 'instructor_tier',
    'livemode'  -- <- if present, 006 is ALSO applied (see §3)
  );
-- EXPECT: at least the 005 columns; note whether 'livemode' appears.

-- 2.2 Instructor-safe view exists
SELECT viewname FROM pg_views
WHERE schemaname = 'public' AND viewname = 'app_marketplace_revenue_events_instructor';
-- EXPECT: 1 row.
```

## 3. Verify 006 — livemode column (CRITICAL before webhook deploy)

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'app_marketplace_revenue_events'
  AND column_name = 'livemode';
-- EXPECT (applied): 1 row — boolean, nullable, no default (three-state fact).
-- EXPECT (not applied): 0 rows -> 006 NOT APPLIED.
```

**If `livemode` is absent: the currently deployed webhook writes it on every
revenue-event insert, PostgREST rejects the whole row, and the webhook swallows
the error by design → silent telemetry loss. DO NOT deploy or operate any
webhook build that writes `livemode` until 006 is applied and re-verified.**

## 4. Stripe Dashboard — dispute events

The webhook handles `charge.dispute.created` / `charge.dispute.closed` in code,
but the endpoint subscription must include them:

1. Stripe Dashboard → Developers → Webhooks → the endpoint used by the deployed
   Edge Function.
2. Confirm `charge.dispute.created` and `charge.dispute.closed` are selected.
3. If not: add them, save, and send a test event ("Send test dispute event" if
   available in test mode).

## 5. Record the result

Append the outcome (date, SHA of the repo at verification, each check PASS/FAIL)
to this file's section 6 and update the STATUS lines of
`sql/004-marketplace-schema.sql`, `sql/005-revenue-events.sql` and
`sql/006-revenue-events-livemode.sql` to reflect the VERIFIED state.

## 6. Verification log

| Date | Repo SHA | 004 | 005 | 006 | Disputes subscribed | By |
|---|---|---|---|---|---|---|
| 2026-09-23 | b5fdbdf (head at ticket creation) | UNVERIFIED (no DB credentials in this environment) | UNVERIFIED | UNVERIFIED | UNVERIFIED | CTO Agent — reported BLOCKED per PO rule |
