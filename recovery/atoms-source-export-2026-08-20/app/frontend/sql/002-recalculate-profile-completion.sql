-- =============================================================================
-- PB-002 FIX: Recalculate profile_completion for ALL existing profiles
-- =============================================================================
-- 
-- PURPOSE:
-- profile_completion is set during onboarding but NEVER recalculated when
-- users add more data (CV, certifications, experience, etc.) from the
-- Profile page. This causes users with complete profiles to show low
-- completion percentages, making them invisible in marketplace search
-- (threshold: >= 30%).
--
-- HOW IT WORKS:
-- Recalculates profile_completion based on the same weights used in
-- src/lib/profileCompletion.ts:
--   photo: 10%, fullName: 5%, position: 5%, company: 5%, location: 5%,
--   yearsExperience: 5%, skills: 10%, bio: 10%, cv: 15%,
--   experience: 15%, certification: 10%, documents: 5%
--
-- SCOPE:
-- All profiles in app_14da0f1941_profiles.
--
-- REVERSIBLE:
-- The old profile_completion values are NOT backed up by this script.
-- Run the backup query first if needed.
--
-- STATUS: DO NOT EXECUTE WITHOUT EXPLICIT AUTHORIZATION
-- =============================================================================

-- Step 1: BACKUP — Save current values before recalculating
-- SELECT user_id, full_name, profile_completion as old_completion
-- FROM app_14da0f1941_profiles
-- ORDER BY full_name;

-- Step 2: Preview — Calculate new values WITHOUT updating
SELECT 
  p.user_id,
  p.full_name,
  p.profile_completion as current_completion,
  (
    CASE WHEN p.avatar_url IS NOT NULL AND length(p.avatar_url) > 0 THEN 10 ELSE 0 END +
    CASE WHEN p.full_name IS NOT NULL AND length(p.full_name) > 1 THEN 5 ELSE 0 END +
    CASE WHEN p.title IS NOT NULL AND length(p.title) > 0 THEN 5 ELSE 0 END +
    CASE WHEN p.company IS NOT NULL AND length(p.company) > 0 THEN 5 ELSE 0 END +
    CASE WHEN p.location IS NOT NULL AND length(p.location) > 0 THEN 5 ELSE 0 END +
    CASE WHEN p.years_experience IS NOT NULL AND p.years_experience > 0 THEN 5 ELSE 0 END +
    CASE WHEN p.skills IS NOT NULL AND array_length(p.skills, 1) > 0 THEN 10 ELSE 0 END +
    CASE WHEN p.bio IS NOT NULL AND length(p.bio) > 10 THEN 10 ELSE 0 END +
    CASE WHEN (p.cv_file_url IS NOT NULL AND length(p.cv_file_url) > 0) 
          OR (p.cv_url IS NOT NULL AND length(p.cv_url) > 0) THEN 15 ELSE 0 END +
    CASE WHEN (SELECT count(*) FROM app_worker_experiences e WHERE e.user_id = p.user_id) > 0 THEN 15 ELSE 0 END +
    CASE WHEN (SELECT count(*) FROM app_worker_certifications c WHERE c.user_id = p.user_id) > 0 THEN 10 ELSE 0 END +
    CASE WHEN (SELECT count(*) FROM app_worker_documents d WHERE d.user_id = p.user_id) > 0 THEN 5 ELSE 0 END
  ) as new_completion
FROM app_14da0f1941_profiles p
ORDER BY full_name;

-- Step 3: Apply recalculation
-- UPDATE app_14da0f1941_profiles p
-- SET 
--   profile_completion = (
--     CASE WHEN p.avatar_url IS NOT NULL AND length(p.avatar_url) > 0 THEN 10 ELSE 0 END +
--     CASE WHEN p.full_name IS NOT NULL AND length(p.full_name) > 1 THEN 5 ELSE 0 END +
--     CASE WHEN p.title IS NOT NULL AND length(p.title) > 0 THEN 5 ELSE 0 END +
--     CASE WHEN p.company IS NOT NULL AND length(p.company) > 0 THEN 5 ELSE 0 END +
--     CASE WHEN p.location IS NOT NULL AND length(p.location) > 0 THEN 5 ELSE 0 END +
--     CASE WHEN p.years_experience IS NOT NULL AND p.years_experience > 0 THEN 5 ELSE 0 END +
--     CASE WHEN p.skills IS NOT NULL AND array_length(p.skills, 1) > 0 THEN 10 ELSE 0 END +
--     CASE WHEN p.bio IS NOT NULL AND length(p.bio) > 10 THEN 10 ELSE 0 END +
--     CASE WHEN (p.cv_file_url IS NOT NULL AND length(p.cv_file_url) > 0) 
--           OR (p.cv_url IS NOT NULL AND length(p.cv_url) > 0) THEN 15 ELSE 0 END +
--     CASE WHEN (SELECT count(*) FROM app_worker_experiences e WHERE e.user_id = p.user_id) > 0 THEN 15 ELSE 0 END +
--     CASE WHEN (SELECT count(*) FROM app_worker_certifications c WHERE c.user_id = p.user_id) > 0 THEN 10 ELSE 0 END +
--     CASE WHEN (SELECT count(*) FROM app_worker_documents d WHERE d.user_id = p.user_id) > 0 THEN 5 ELSE 0 END
--   ),
--   updated_at = NOW();

-- Step 4: Verify — Compare before/after
-- SELECT 
--   full_name,
--   profile_completion as new_completion,
--   CASE 
--     WHEN profile_completion >= 30 THEN 'MARKETPLACE VISIBLE'
--     ELSE 'BELOW THRESHOLD'
--   END as marketplace_status
-- FROM app_14da0f1941_profiles
-- ORDER BY profile_completion DESC;
