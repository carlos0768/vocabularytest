-- ============================================
-- SECURITY FIXES - Run this in Supabase SQL Editor
-- ============================================
-- This script applies all security-related migrations:
-- 1. Scan usage tracking with server-side enforcement
-- 2. Pro-gated cloud sync with read access for cancelled users
--
-- Safe to re-run (uses IF EXISTS / IF NOT EXISTS)
-- ============================================

-- ============================================
-- PART 1: Scan Usage Tracking Table
-- ============================================

-- Table to track daily scan usage per user
CREATE TABLE IF NOT EXISTS daily_scan_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  scan_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, scan_date)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_scan_usage_user_date ON daily_scan_usage(user_id, scan_date);

-- Enable RLS
ALTER TABLE daily_scan_usage ENABLE ROW LEVEL SECURITY;

-- Users can only view their own scan usage
DROP POLICY IF EXISTS "Users can view own scan usage" ON daily_scan_usage;
CREATE POLICY "Users can view own scan usage"
  ON daily_scan_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Block direct INSERT/UPDATE to prevent tampering
DROP POLICY IF EXISTS "Users can insert own scan usage" ON daily_scan_usage;
DROP POLICY IF EXISTS "Users can update own scan usage" ON daily_scan_usage;

-- Auto-update updated_at timestamp
DROP TRIGGER IF EXISTS update_daily_scan_usage_updated_at ON daily_scan_usage;
CREATE TRIGGER update_daily_scan_usage_updated_at
  BEFORE UPDATE ON daily_scan_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PART 2: Check and Increment Scan Function
-- ============================================

-- Drop all old versions of the function
DROP FUNCTION IF EXISTS check_and_increment_scan();
DROP FUNCTION IF EXISTS check_and_increment_scan(BOOLEAN);
DROP FUNCTION IF EXISTS check_and_increment_scan(UUID, BOOLEAN);

-- Create the new function with Pro check
CREATE OR REPLACE FUNCTION public.check_and_increment_scan(
  p_require_pro BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_pro BOOLEAN := FALSE;
  v_limit INTEGER := 3;
  v_current_count INTEGER;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check Pro status from subscriptions table (server-side, can't be spoofed)
  SELECT (status = 'active' AND plan = 'pro')
    INTO v_is_pro
  FROM subscriptions
  WHERE user_id = v_user_id;

  v_is_pro := COALESCE(v_is_pro, FALSE);
  IF v_is_pro THEN
    v_limit := NULL;  -- Unlimited for Pro users
  END IF;

  -- If feature requires Pro and user is not Pro, reject immediately
  IF p_require_pro AND NOT v_is_pro THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current_count', 0,
      'limit', v_limit,
      'is_pro', v_is_pro,
      'requires_pro', true
    );
  END IF;

  -- Ensure today's row exists (upsert)
  INSERT INTO daily_scan_usage (user_id, scan_date, scan_count)
  VALUES (v_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, scan_date) DO NOTHING;

  -- Atomic increment with limit check (prevents race condition)
  UPDATE daily_scan_usage
  SET scan_count = scan_count + 1
  WHERE user_id = v_user_id
    AND scan_date = CURRENT_DATE
    AND (v_limit IS NULL OR scan_count < v_limit)
  RETURNING scan_count INTO v_current_count;

  -- If update didn't affect any rows, limit was reached
  IF NOT FOUND THEN
    SELECT scan_count INTO v_current_count
    FROM daily_scan_usage
    WHERE user_id = v_user_id AND scan_date = CURRENT_DATE;

    RETURN jsonb_build_object(
      'allowed', false,
      'current_count', COALESCE(v_current_count, 0),
      'limit', v_limit,
      'is_pro', v_is_pro
    );
  END IF;

  -- Success
  RETURN jsonb_build_object(
    'allowed', true,
    'current_count', v_current_count,
    'limit', v_limit,
    'is_pro', v_is_pro
  );
END;
$$;

-- Grant execute permission to authenticated users only
REVOKE ALL ON FUNCTION public.check_and_increment_scan(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_scan(BOOLEAN) TO authenticated;

-- ============================================
-- PART 3: Pro-Gated Cloud Sync (Projects)
-- ============================================

-- Drop all old project policies
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can create own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
DROP POLICY IF EXISTS "Pro users can view own projects" ON projects;
DROP POLICY IF EXISTS "Pro users can create own projects" ON projects;
DROP POLICY IF EXISTS "Pro users can update own projects" ON projects;
DROP POLICY IF EXISTS "Pro users can delete own projects" ON projects;
DROP POLICY IF EXISTS "Active Pro users can create own projects" ON projects;
DROP POLICY IF EXISTS "Active Pro users can update own projects" ON projects;
DROP POLICY IF EXISTS "Active Pro users can delete own projects" ON projects;

-- READ: Pro users (active OR cancelled) can view their own projects
CREATE POLICY "Pro users can view own projects"
  ON projects FOR SELECT
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.plan = 'pro'
    )
  );

-- WRITE: Only ACTIVE Pro users can create/update/delete
CREATE POLICY "Active Pro users can create own projects"
  ON projects FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

CREATE POLICY "Active Pro users can update own projects"
  ON projects FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

CREATE POLICY "Active Pro users can delete own projects"
  ON projects FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

-- ============================================
-- PART 4: Pro-Gated Cloud Sync (Words)
-- ============================================

-- Drop all old word policies
DROP POLICY IF EXISTS "Users can view own words" ON words;
DROP POLICY IF EXISTS "Users can create words in own projects" ON words;
DROP POLICY IF EXISTS "Users can update own words" ON words;
DROP POLICY IF EXISTS "Users can delete own words" ON words;
DROP POLICY IF EXISTS "Pro users can view own words" ON words;
DROP POLICY IF EXISTS "Pro users can create words in own projects" ON words;
DROP POLICY IF EXISTS "Pro users can update own words" ON words;
DROP POLICY IF EXISTS "Pro users can delete own words" ON words;
DROP POLICY IF EXISTS "Active Pro users can create words in own projects" ON words;
DROP POLICY IF EXISTS "Active Pro users can update own words" ON words;
DROP POLICY IF EXISTS "Active Pro users can delete own words" ON words;

-- READ: Pro users (active OR cancelled) can view their own words
CREATE POLICY "Pro users can view own words"
  ON words FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.plan = 'pro'
    )
  );

-- WRITE: Only ACTIVE Pro users can create/update/delete
CREATE POLICY "Active Pro users can create words in own projects"
  ON words FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

CREATE POLICY "Active Pro users can update own words"
  ON words FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

CREATE POLICY "Active Pro users can delete own words"
  ON words FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

-- ============================================
-- VERIFICATION QUERIES (Run after applying)
-- ============================================
--
-- 1. Verify function exists:
-- SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE p.proname = 'check_and_increment_scan';
--
-- 2. Verify table exists:
-- SELECT * FROM information_schema.tables WHERE table_name = 'daily_scan_usage';
--
-- 3. Test the function (as authenticated user):
-- SELECT public.check_and_increment_scan(false);
--
-- 4. Verify policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('projects', 'words', 'daily_scan_usage');
