-- ============================================================
-- RLS Security Fix: app_worker_certifications
-- Date: 2026-05-17
-- Description: Enable Row Level Security on app_worker_certifications
--              to prevent anonymous public access and enforce
--              user-level data isolation.
-- ============================================================

BEGIN;

-- Step 1: Enable RLS on the table
ALTER TABLE public.app_worker_certifications ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "cert_owner_select" ON public.app_worker_certifications;
DROP POLICY IF EXISTS "cert_owner_insert" ON public.app_worker_certifications;
DROP POLICY IF EXISTS "cert_owner_update" ON public.app_worker_certifications;
DROP POLICY IF EXISTS "cert_owner_delete" ON public.app_worker_certifications;
DROP POLICY IF EXISTS "cert_authenticated_select_visible" ON public.app_worker_certifications;
DROP POLICY IF EXISTS "cert_admin_all" ON public.app_worker_certifications;

-- Step 3: Owner can SELECT their own certifications
CREATE POLICY "cert_owner_select"
  ON public.app_worker_certifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Step 4: Other authenticated users can SELECT visible certifications
-- (for CandidateProfile, CompanyWorkersSearch, etc.)
CREATE POLICY "cert_authenticated_select_visible"
  ON public.app_worker_certifications
  FOR SELECT
  TO authenticated
  USING (is_visible = true);

-- Step 5: Owner can INSERT their own certifications
CREATE POLICY "cert_owner_insert"
  ON public.app_worker_certifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Step 6: Owner can UPDATE their own certifications
CREATE POLICY "cert_owner_update"
  ON public.app_worker_certifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 7: Owner can DELETE their own certifications
CREATE POLICY "cert_owner_delete"
  ON public.app_worker_certifications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Step 8: Admin role gets full access to all rows (SELECT, INSERT, UPDATE, DELETE)
-- Admin is determined by checking the role column in the profiles table
CREATE POLICY "cert_admin_all"
  ON public.app_worker_certifications
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_14da0f1941_profiles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_14da0f1941_profiles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Step 9: Explicitly deny anonymous access (anon role gets nothing)
-- RLS is enabled and no policies grant access to anon, so this is implicit.
-- But we add a comment for clarity: anon key cannot read/write this table.

COMMIT;