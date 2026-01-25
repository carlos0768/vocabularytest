-- ============================================
-- Scan Usage Tracking Table
-- Server-side enforcement of daily scan limits
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
CREATE POLICY "Users can view own scan usage"
  ON daily_scan_usage FOR SELECT
  USING (auth.uid() = user_id);

-- NOTE: Direct INSERT/UPDATE is intentionally blocked to prevent tampering.
-- Scan counts should only be modified via security definer RPC.
DROP POLICY IF EXISTS "Users can insert own scan usage"
  ON daily_scan_usage;
DROP POLICY IF EXISTS "Users can update own scan usage"
  ON daily_scan_usage;

-- Auto-update updated_at timestamp
DROP TRIGGER IF EXISTS update_daily_scan_usage_updated_at ON daily_scan_usage;
CREATE TRIGGER update_daily_scan_usage_updated_at
  BEFORE UPDATE ON daily_scan_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Helper function to check and increment scan count
-- Returns: { allowed: boolean, current_count: integer, limit: integer }
-- ============================================
DROP FUNCTION IF EXISTS check_and_increment_scan();
DROP FUNCTION IF EXISTS check_and_increment_scan(BOOLEAN);
DROP FUNCTION IF EXISTS check_and_increment_scan(UUID, BOOLEAN);
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (status = 'active' AND plan = 'pro')
    INTO v_is_pro
  FROM subscriptions
  WHERE user_id = v_user_id;

  v_is_pro := COALESCE(v_is_pro, FALSE);
  IF v_is_pro THEN
    v_limit := NULL;
  END IF;

  IF p_require_pro AND NOT v_is_pro THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current_count', 0,
      'limit', v_limit,
      'is_pro', v_is_pro,
      'requires_pro', true
    );
  END IF;

  -- Ensure today's row exists
  INSERT INTO daily_scan_usage (user_id, scan_date, scan_count)
  VALUES (v_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, scan_date) DO NOTHING;

  -- Atomic increment with limit check
  UPDATE daily_scan_usage
  SET scan_count = scan_count + 1
  WHERE user_id = v_user_id
    AND scan_date = CURRENT_DATE
    AND (v_limit IS NULL OR scan_count < v_limit)
  RETURNING scan_count INTO v_current_count;

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

  RETURN jsonb_build_object(
    'allowed', true,
    'current_count', v_current_count,
    'limit', v_limit,
    'is_pro', v_is_pro
  );
END;
$$;

-- Grant execute permission to authenticated users only
-- Note: Use the full signature with default parameter
REVOKE ALL ON FUNCTION public.check_and_increment_scan(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_scan(BOOLEAN) TO authenticated;
