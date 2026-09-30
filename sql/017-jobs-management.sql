-- =============================================================================
-- 017-jobs-management.sql — PB-JOBS-PILOT-003
-- Job management (admin create/edit/publish/close) + explicit salary mode
--
-- PROBLEM
--   1. Admin job creation/editing was developer/SQL-only; CompanyPostJob only
--      INSERTed a legacy-shaped open job and never touched the structured
--      fields the pilot jobs rely on.
--   2. The compact card's hourly salary is computed from `salary_period`, but
--      the "from / fixed / range" intent is only implicit in
--      (salary_min, salary_max) — the legacy formatSalary heuristic
--      ("amount < 10000 = monthly") is the documented weakness.
--
-- DELTA (additive only)
--   - app_14da0f1941_jobs.salary_mode text CHECK IN ('from','fixed','range').
--     Existing rows: INEOS/BASF backfilled to 'from' (their "From €25 gross/
--     hour" wording). Legacy rows with both min and max get 'range', rows
--     with only min get 'fixed' — no heuristic, explicit values only.
--   - No column is dropped/retyped; no existing constraint is altered.
--
-- RLS
--   No new/changed policies. INSERT/UPDATE/DELETE already exist for
--   own-or-primary-admin on app_14da0f1941_jobs (jobs_*_own_or_primary_admin)
--   and job management rides on them — no weakening.
--
-- ROLLBACK
--   ALTER TABLE app_14da0f1941_jobs DROP COLUMN IF EXISTS salary_mode;
--
-- COMPATIBILITY
--   - salary_mode is nullable; the UI falls back to salary_period/legacy
--     formatting when it is absent, so un-migrated environments keep working.
--   - The 001-016 schema is untouched.
-- =============================================================================

ALTER TABLE app_14da0f1941_jobs
  ADD COLUMN IF NOT EXISTS salary_mode text CHECK (salary_mode IN ('from', 'fixed', 'range'));

COMMENT ON COLUMN app_14da0f1941_jobs.salary_mode IS
  'How salary_min/salary_max read: from (≥ min), fixed (exact min), range (min–max). Replaces the legacy formatSalary amount heuristic.';

-- Backfill the two real pilot jobs explicitly (from-wording), then legacy rows.
UPDATE app_14da0f1941_jobs
SET salary_mode = 'from'
WHERE salary_mode IS NULL
  AND salary_period = 'hour';

-- Legacy range/fixed for rows that have structured amounts but no hour period.
UPDATE app_14da0f1941_jobs
SET salary_mode = CASE WHEN salary_max IS NOT NULL THEN 'range' ELSE 'fixed' END
WHERE salary_mode IS NULL
  AND salary_min IS NOT NULL;

-- Verification
SELECT id, title, salary_mode, salary_period, salary_min, salary_max, currency FROM app_14da0f1941_jobs ORDER BY created_at DESC;
