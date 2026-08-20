-- ============================================================
-- Beta Feedback Reports — FIX RLS Policies
-- Run this ENTIRE script in Supabase SQL Editor
-- 
-- PROBLEM: INSERT returns 403 because RLS policy blocks it.
-- FIX: Create proper INSERT policy that matches auth.uid() to user_id
-- ============================================================

BEGIN;

-- ─── Step 0: Check column type and adapt ──────────────────────────────
-- The user_id column may be UUID or TEXT. We handle both.

-- ─── Helper Function: is_admin_user() ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_14da0f1941_profiles
    WHERE user_id = auth.uid()::text
    AND role = 'admin'
  );
$$;

-- ─── Enable RLS (idempotent) ──────────────────────────────────────────
ALTER TABLE public.beta_feedback_reports ENABLE ROW LEVEL SECURITY;

-- ─── Drop ALL existing policies (clean slate) ─────────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'beta_feedback_reports' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.beta_feedback_reports', pol.policyname);
  END LOOP;
END;
$$;

-- ─── INSERT Policy ────────────────────────────────────────────────────
-- Authenticated users can insert IF user_id matches their auth.uid()
-- Handles both UUID and TEXT column types via casting both sides to text

CREATE POLICY "feedback_insert_authenticated"
  ON public.beta_feedback_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id::text = auth.uid()::text)
    OR (user_id IS NULL)
  );

-- ─── SELECT Policy: Only admins ───────────────────────────────────────

CREATE POLICY "feedback_select_admin"
  ON public.beta_feedback_reports
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
  );

-- ─── UPDATE Policy: Only admins ───────────────────────────────────────

CREATE POLICY "feedback_update_admin"
  ON public.beta_feedback_reports
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- ─── DELETE Policy: Only admins ───────────────────────────────────────

CREATE POLICY "feedback_delete_admin"
  ON public.beta_feedback_reports
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

-- ─── Storage Bucket: feedback-screenshots ─────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- ─── Storage Policies ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "feedback_screenshots_upload" ON storage.objects;
DROP POLICY IF EXISTS "feedback_screenshots_admin_read" ON storage.objects;

CREATE POLICY "feedback_screenshots_upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'feedback-screenshots');

CREATE POLICY "feedback_screenshots_admin_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'feedback-screenshots'
    AND public.is_admin_user()
  );

-- ─── Indexes ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_beta_feedback_status ON public.beta_feedback_reports(status);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created ON public.beta_feedback_reports(created_at DESC);

-- ─── Enable Realtime ──────────────────────────────────────────────────
-- Required for the admin badge to receive INSERT events in real time.
-- This adds the table to the supabase_realtime publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'beta_feedback_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.beta_feedback_reports;
  END IF;
END;
$$;

COMMIT;

-- ============================================================
-- VERIFICATION: After running, test with this query:
-- 
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'beta_feedback_reports' AND column_name = 'user_id';
--
-- If data_type = 'uuid': the frontend sends auth.uid() which is UUID → OK
-- If data_type = 'text': the frontend sends auth.uid() as string → OK
-- The policy casts both sides to text so it works either way.
-- ============================================================