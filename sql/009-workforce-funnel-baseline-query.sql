-- =============================================================================
-- WFA-007: Workforce funnel baseline — READ-ONLY query (no schema change)
-- =============================================================================
--
-- PURPOSE:
-- Recompute the canonical D11 baseline WITHOUT creating any view.
-- D18 ruling: CREATE VIEW is a schema mutation; until 008 is authorized and
-- applied, the baseline must be produced by this plain SELECT/CTE which
-- reproduces the canonical predicates verbatim.
--
-- OUTPUT 1 — funnel counters:
--   canonical_workers, complete, workforce_ready, matchable,
--   credential_evidence, credential_verified
--
-- OUTPUT 2 — per-requirement failure breakdown (for P0-B CTA prioritization):
--   For each D11 requirement, workers of the canonical cohort split into:
--     ok                     — requirement satisfied
--     not_specified (UNKNOWN) — data absent (NULL / '' / 'not_specified' / 0 rows)
--     present_but_failing    — data present but does not satisfy the predicate
--   This distinction decides which CTA to prioritize: capture prompts fix
--   not_specified; only a user decision fixes present_but_failing.
--
-- STATUS: READ-ONLY. SELECT only. Safe to execute against production.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- OUTPUT 1: funnel counters (canonical cohort role='worker')
-- -----------------------------------------------------------------------------
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
),
w AS (
  SELECT
    p.*,
    coalesce(c.qualifying_experience_count, 0) AS qualifying_experience_count,
    coalesce(c.certification_count, 0) AS certification_count,
    coalesce(c.verified_certification_count, 0) AS verified_certification_count
  FROM app_14da0f1941_profiles p
  LEFT JOIN counts c ON c.user_id = p.user_id
  WHERE p.role = 'worker'
)
SELECT
  count(*) AS canonical_workers,
  count(*) FILTER (
    WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
      AND title IS NOT NULL AND btrim(title) <> ''
      AND location IS NOT NULL AND btrim(location) <> ''
      AND years_experience IS NOT NULL
      AND bio IS NOT NULL AND length(btrim(bio)) > 10
      AND coalesce(array_length(skills, 1), 0) > 0
  ) AS complete,
  count(*) FILTER (
    WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
      AND title IS NOT NULL AND btrim(title) <> ''
      AND location IS NOT NULL AND btrim(location) <> ''
      AND years_experience IS NOT NULL
      AND bio IS NOT NULL AND length(btrim(bio)) > 10
      AND coalesce(array_length(skills, 1), 0) > 0
      AND qualifying_experience_count >= 1
      AND availability_status IS NOT NULL
      AND availability_status <> ''
      AND availability_status <> 'not_specified'
  ) AS workforce_ready,
  count(*) FILTER (
    WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
      AND title IS NOT NULL AND btrim(title) <> ''
      AND location IS NOT NULL AND btrim(location) <> ''
      AND years_experience IS NOT NULL
      AND bio IS NOT NULL AND length(btrim(bio)) > 10
      AND coalesce(array_length(skills, 1), 0) > 0
      AND qualifying_experience_count >= 1
      AND availability_status IN (
        'available_immediately',
        'available_soon',
        'available_from_date'
      )
      AND (profile_visibility = 'public' OR cv_visible = true)
  ) AS matchable,
  count(*) FILTER (WHERE certification_count >= 1) AS credential_evidence,
  count(*) FILTER (WHERE verified_certification_count >= 1) AS credential_verified
FROM w;

-- -----------------------------------------------------------------------------
-- OUTPUT 2: per-requirement failure breakdown — not_specified vs present_but_failing
-- -----------------------------------------------------------------------------
-- Reuses the same CTE shape; run standalone (repeat the CTE) in environments
-- that do not allow multiple statements referencing a shared CTE.
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
    (SELECT count(*) FROM app_worker_certifications c WHERE c.user_id = p.user_id) AS certification_count
  FROM app_14da0f1941_profiles p
),
w AS (
  SELECT
    p.*,
    coalesce(c.qualifying_experience_count, 0) AS qualifying_experience_count,
    coalesce(c.certification_count, 0) AS certification_count
  FROM app_14da0f1941_profiles p
  LEFT JOIN counts c ON c.user_id = p.user_id
  WHERE p.role = 'worker'
),
breakdown AS (
  SELECT
    'full_name' AS requirement, 'COMPLETE' AS unlocks,
    count(*) FILTER (WHERE full_name IS NOT NULL AND btrim(full_name) <> '') AS ok,
    count(*) FILTER (WHERE full_name IS NULL OR btrim(full_name) = '') AS not_specified,
    count(*) FILTER (WHERE false) AS present_but_failing
  FROM w
  UNION ALL
  SELECT 'title', 'COMPLETE',
    count(*) FILTER (WHERE title IS NOT NULL AND btrim(title) <> ''),
    count(*) FILTER (WHERE title IS NULL OR btrim(title) = ''),
    count(*) FILTER (WHERE false)
  FROM w
  UNION ALL
  SELECT 'location', 'COMPLETE',
    count(*) FILTER (WHERE location IS NOT NULL AND btrim(location) <> ''),
    count(*) FILTER (WHERE location IS NULL OR btrim(location) = ''),
    count(*) FILTER (WHERE false)
  FROM w
  UNION ALL
  SELECT 'years_experience', 'COMPLETE',
    count(*) FILTER (WHERE years_experience IS NOT NULL),
    count(*) FILTER (WHERE years_experience IS NULL),
    count(*) FILTER (WHERE false)
  FROM w
  UNION ALL
  -- bio: not_specified = absent/empty; present_but_failing = present but <= 10 trimmed chars
  SELECT 'bio', 'COMPLETE',
    count(*) FILTER (WHERE bio IS NOT NULL AND length(btrim(bio)) > 10),
    count(*) FILTER (WHERE bio IS NULL OR btrim(bio) = ''),
    count(*) FILTER (WHERE bio IS NOT NULL AND btrim(bio) <> '' AND length(btrim(bio)) <= 10)
  FROM w
  UNION ALL
  SELECT 'skills', 'COMPLETE',
    count(*) FILTER (WHERE coalesce(array_length(skills, 1), 0) > 0),
    count(*) FILTER (WHERE skills IS NULL OR coalesce(array_length(skills, 1), 0) = 0),
    count(*) FILTER (WHERE false)
  FROM w
  UNION ALL
  -- structured experience: QUALIFYING EXPERIENCE required (WFA-001);
  -- years_experience NEVER substitutes (D18 rule)
  SELECT 'experience', 'WORKFORCE_READY',
    count(*) FILTER (WHERE qualifying_experience_count >= 1),
    count(*) FILTER (WHERE qualifying_experience_count = 0),
    count(*) FILTER (WHERE false)
  FROM w
  UNION ALL
  -- availability: UNKNOWN = NULL/''/'not_specified'; present_but_failing for
  -- MATCHABLE = declared NOT_AVAILABLE (a decision, not missing data)
  SELECT 'availability', 'WORKFORCE_READY',
    count(*) FILTER (
      WHERE availability_status IS NOT NULL AND availability_status <> ''
        AND availability_status <> 'not_specified'
    ),
    count(*) FILTER (
      WHERE availability_status IS NULL OR availability_status = ''
        OR availability_status = 'not_specified'
    ),
    count(*) FILTER (WHERE availability_status = 'not_currently_available')
  FROM w
  UNION ALL
  SELECT 'visibility', 'MATCHABLE',
    count(*) FILTER (WHERE profile_visibility = 'public' OR cv_visible = true),
    count(*) FILTER (WHERE profile_visibility IS NULL AND cv_visible IS NULL),
    count(*) FILTER (WHERE (profile_visibility IS NOT NULL AND profile_visibility <> 'public' AND NOT cv_visible) OR (cv_visible = false AND (profile_visibility IS NULL OR profile_visibility <> 'public')))
  FROM w
  UNION ALL
  SELECT 'credential_evidence', 'SUPPORTING',
    count(*) FILTER (WHERE certification_count >= 1),
    count(*) FILTER (WHERE certification_count = 0),
    count(*) FILTER (WHERE false)
  FROM w
)
SELECT
  requirement,
  unlocks,
  ok,
  not_specified,
  present_but_failing
FROM breakdown
ORDER BY CASE unlocks
    WHEN 'COMPLETE' THEN 1
    WHEN 'WORKFORCE_READY' THEN 2
    WHEN 'MATCHABLE' THEN 3
    ELSE 4
  END, requirement;
