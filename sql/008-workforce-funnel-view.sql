-- =============================================================================
-- WFA-007: Canonical workforce funnel view (D11 predicates, verbatim)
-- =============================================================================
--
-- PURPOSE:
-- Single SQL source of truth for the workforce readiness funnel:
--   REGISTERED(canonical) -> COMPLETE -> WORKFORCE READY -> MATCHABLE
-- plus credential evidence / verified counters, restricted to the canonical
-- workforce cohort (role = 'worker', D14).
--
-- HOW IT WORKS:
-- The predicates replicate app/frontend/src/lib/workforceReadiness.ts
-- VERBATIM. That TypeScript library is the canonical source
-- (brain/growth/federation-network/D11_PROFILE_MATURITY_MODEL.md).
-- A parity test (tests/workforce-funnel-sql-parity.spec.ts) pins the SQL
-- literals to the TypeScript constants; if either side changes, the test
-- fails and forces both to be updated together.
--
-- PREDICATE RULES (D11/D14/D18 + WFA-001):
--   * Cohort: role = 'worker' ONLY (never 'user' / 'company' / 'admin').
--   * COMPLETE: full_name, title, location non-empty; years_experience set;
--     bio > 10 chars (trimmed); skills non-empty array.
--   * years_experience is a summary field and NEVER substitutes structured
--     experience rows (app_worker_experiences).
--   * QUALIFYING EXPERIENCE (WFA-001): an app_worker_experiences row counts
--     only when position AND company_name are non-empty (btrim). Bare or
--     partial rows do NOT satisfy the predicate.
--   * WORKFORCE READY: COMPLETE + >=1 QUALIFYING EXPERIENCE row +
--     availability explicitly specified (AVAILABLE or NOT_AVAILABLE).
--     NULL / '' / 'not_specified' count as UNKNOWN, not as false.
--   * MATCHABLE: WORKFORCE READY + PUBLIC (profile_visibility = 'public'
--     OR cv_visible = true) + AVAILABLE.
--
-- STATUS: *** UNAPPLIED — DO NOT EXECUTE WITHOUT EXPLICIT PO AUTHORIZATION ***
-- D18 ruling: a CREATE VIEW is a SCHEMA mutation even though the view itself
-- is read-only for data. The canonical baseline must be recomputed with the
-- plain SELECT/CTE in 009-workforce-funnel-baseline-query.sql (no schema
-- change) until this migration is explicitly authorized and applied.
-- =============================================================================

CREATE OR REPLACE VIEW app_workforce_funnel AS
WITH counts AS (
  SELECT
    p.user_id,
    -- QUALIFYING EXPERIENCE (WFA-001): position AND company_name non-empty.
    -- Mirrors isQualifyingExperience() in workforceReadiness.ts verbatim.
    (
      SELECT count(*) FROM app_worker_experiences e
      WHERE e.user_id = p.user_id
        AND e.position IS NOT NULL AND btrim(e.position) <> ''
        AND e.company_name IS NOT NULL AND btrim(e.company_name) <> ''
    ) AS qualifying_experience_count,
    (SELECT count(*) FROM app_worker_certifications c WHERE c.user_id = p.user_id) AS certification_count,
    (SELECT count(*) FROM app_worker_certifications c WHERE c.user_id = p.user_id AND c.verified = true) AS verified_certification_count
  FROM app_14da0f1941_profiles p
)
SELECT
  count(*) FILTER (WHERE p.role = 'worker') AS canonical_workers,
  -- COMPLETE (verbatim from isComplete())
  count(*) FILTER (
    WHERE p.role = 'worker'
      AND p.full_name IS NOT NULL AND btrim(p.full_name) <> ''
      AND p.title IS NOT NULL AND btrim(p.title) <> ''
      AND p.location IS NOT NULL AND btrim(p.location) <> ''
      AND p.years_experience IS NOT NULL
      AND p.bio IS NOT NULL AND length(btrim(p.bio)) > 10
      AND coalesce(array_length(p.skills, 1), 0) > 0
  ) AS complete,
  -- WORKFORCE READY (verbatim from isWorkforceReady())
  count(*) FILTER (
    WHERE p.role = 'worker'
      AND p.full_name IS NOT NULL AND btrim(p.full_name) <> ''
      AND p.title IS NOT NULL AND btrim(p.title) <> ''
      AND p.location IS NOT NULL AND btrim(p.location) <> ''
      AND p.years_experience IS NOT NULL
      AND p.bio IS NOT NULL AND length(btrim(p.bio)) > 10
      AND coalesce(array_length(p.skills, 1), 0) > 0
      AND coalesce(c.qualifying_experience_count, 0) >= 1
      AND p.availability_status IS NOT NULL
      AND p.availability_status <> ''
      AND p.availability_status <> 'not_specified'
  ) AS workforce_ready,
  -- MATCHABLE (verbatim from isMatchable())
  count(*) FILTER (
    WHERE p.role = 'worker'
      AND p.full_name IS NOT NULL AND btrim(p.full_name) <> ''
      AND p.title IS NOT NULL AND btrim(p.title) <> ''
      AND p.location IS NOT NULL AND btrim(p.location) <> ''
      AND p.years_experience IS NOT NULL
      AND p.bio IS NOT NULL AND length(btrim(p.bio)) > 10
      AND coalesce(array_length(p.skills, 1), 0) > 0
      AND coalesce(c.qualifying_experience_count, 0) >= 1
      AND p.availability_status IN (
        'available_immediately',
        'available_soon',
        'available_from_date'
      )
      AND (p.profile_visibility = 'public' OR p.cv_visible = true)
  ) AS matchable,
  -- Credential evidence / verified
  count(*) FILTER (
    WHERE p.role = 'worker' AND coalesce(c.certification_count, 0) >= 1
  ) AS credential_evidence,
  count(*) FILTER (
    WHERE p.role = 'worker' AND coalesce(c.verified_certification_count, 0) >= 1
  ) AS credential_verified
FROM app_14da0f1941_profiles p
LEFT JOIN counts c ON c.user_id = p.user_id;
