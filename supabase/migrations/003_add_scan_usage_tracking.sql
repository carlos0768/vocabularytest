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

-- Users can insert their own scan usage (through service role or authenticated)
CREATE POLICY "Users can insert own scan usage"
  ON daily_scan_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own scan usage
CREATE POLICY "Users can update own scan usage"
  ON daily_scan_usage FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_daily_scan_usage_updated_at
  BEFORE UPDATE ON daily_scan_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Helper function to check and increment scan count
-- Returns: { allowed: boolean, current_count: integer, limit: integer }
-- ============================================
CREATE OR REPLACE FUNCTION check_and_increment_scan(
  p_user_id UUID,
  p_is_pro BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_scan_limit INTEGER;
  v_current_count INTEGER;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Set limit based on subscription status
  IF p_is_pro THEN
    v_scan_limit := 999999; -- Unlimited for Pro
  ELSE
    v_scan_limit := 3; -- Free users get 3 scans per day
  END IF;

  -- Get or create today's record
  INSERT INTO daily_scan_usage (user_id, scan_date, scan_count)
  VALUES (p_user_id, v_today, 0)
  ON CONFLICT (user_id, scan_date) DO NOTHING;

  -- Get current count
  SELECT scan_count INTO v_current_count
  FROM daily_scan_usage
  WHERE user_id = p_user_id AND scan_date = v_today;

  -- Check if allowed
  IF v_current_count >= v_scan_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current_count', v_current_count,
      'limit', v_scan_limit
    );
  END IF;

  -- Increment count
  UPDATE daily_scan_usage
  SET scan_count = scan_count + 1
  WHERE user_id = p_user_id AND scan_date = v_today;

  RETURN jsonb_build_object(
    'allowed', true,
    'current_count', v_current_count + 1,
    'limit', v_scan_limit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
