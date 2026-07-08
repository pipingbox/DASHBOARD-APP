-- =============================================================================
-- PB-002 FIX: Migrate profile_visibility from 'private' to 'public'
-- =============================================================================
-- 
-- PURPOSE:
-- 39 of 43 worker profiles have profile_visibility = 'private', which makes
-- them invisible in the marketplace search (CompanyWorkersSearch.tsx).
-- This single field is the #1 reason workers don't appear in searches.
--
-- SCOPE:
-- Only updates worker profiles (account_type = 'worker').
-- Does NOT touch admin or company accounts.
--
-- REVERSIBLE:
-- YES — run the rollback section at the bottom to undo.
--
-- STATUS: DO NOT EXECUTE WITHOUT EXPLICIT AUTHORIZATION
-- =============================================================================

-- Step 1: Preview — see what will change BEFORE running the update
SELECT 
  user_id,
  full_name,
  profile_visibility,
  cv_visible,
  account_type
FROM app_14da0f1941_profiles
WHERE profile_visibility = 'private'
  AND (account_type = 'worker' OR account_type IS NULL)
ORDER BY full_name;

-- Step 2: Apply migration
-- UPDATE app_14da0f1941_profiles
-- SET 
--   profile_visibility = 'public',
--   cv_visible = true,
--   updated_at = NOW()
-- WHERE profile_visibility = 'private'
--   AND (account_type = 'worker' OR account_type IS NULL);

-- Step 3: Verify results
-- SELECT 
--   profile_visibility, 
--   count(*) as total
-- FROM app_14da0f1941_profiles
-- GROUP BY profile_visibility;

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================
-- UPDATE app_14da0f1941_profiles
-- SET 
--   profile_visibility = 'private',
--   updated_at = NOW()
-- WHERE profile_visibility = 'public'
--   AND updated_at > '2026-06-20';  -- adjust date to match migration time
