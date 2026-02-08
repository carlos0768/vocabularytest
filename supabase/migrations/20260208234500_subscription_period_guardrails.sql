-- Subscription period-aware guardrails
-- 1) Add cancellation/session metadata columns
-- 2) Add shared helper for "active Pro" checks
-- 3) Update scan gating and Pro-only write/sharing policies to respect period end

-- ============================================
-- 1. Schema updates
-- ============================================
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

UPDATE public.subscriptions
SET cancel_at_period_end = FALSE
WHERE cancel_at_period_end IS NULL;

ALTER TABLE public.subscriptions
  ALTER COLUMN cancel_at_period_end SET DEFAULT FALSE,
  ALTER COLUMN cancel_at_period_end SET NOT NULL;

ALTER TABLE public.subscription_sessions
  ADD COLUMN IF NOT EXISTS komoju_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS komoju_subscription_id TEXT;

-- ============================================
-- 2. Helper: period-aware active Pro check
-- ============================================
CREATE OR REPLACE FUNCTION public.is_active_pro(
  p_status TEXT,
  p_plan TEXT,
  p_current_period_end TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT
    p_status = 'active'
    AND p_plan = 'pro'
    AND (
      p_current_period_end IS NULL
      OR p_current_period_end > NOW()
    );
$$;

-- ============================================
-- 3. Scan gate: period-aware Pro check
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

  SELECT public.is_active_pro(status, plan, current_period_end)
    INTO v_is_pro
  FROM subscriptions
  WHERE user_id = v_user_id
  LIMIT 1;

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

  INSERT INTO daily_scan_usage (user_id, scan_date, scan_count)
  VALUES (v_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, scan_date) DO NOTHING;

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

REVOKE ALL ON FUNCTION public.check_and_increment_scan(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_scan(BOOLEAN) TO authenticated;

-- ============================================
-- 4. Pro-only write/share policies:
--    require period-aware active Pro
-- ============================================
DROP POLICY IF EXISTS "Active Pro users can create own projects" ON projects;
DROP POLICY IF EXISTS "Active Pro users can update own projects" ON projects;
DROP POLICY IF EXISTS "Active Pro users can delete own projects" ON projects;
DROP POLICY IF EXISTS "Pro users can view shared projects" ON projects;

CREATE POLICY "Active Pro users can create own projects"
  ON projects FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND public.is_active_pro(s.status, s.plan, s.current_period_end)
    )
  );

CREATE POLICY "Active Pro users can update own projects"
  ON projects FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND public.is_active_pro(s.status, s.plan, s.current_period_end)
    )
  );

CREATE POLICY "Active Pro users can delete own projects"
  ON projects FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND public.is_active_pro(s.status, s.plan, s.current_period_end)
    )
  );

CREATE POLICY "Pro users can view shared projects"
  ON projects FOR SELECT
  USING (
    share_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND public.is_active_pro(s.status, s.plan, s.current_period_end)
    )
  );

DROP POLICY IF EXISTS "Active Pro users can create words in own projects" ON words;
DROP POLICY IF EXISTS "Active Pro users can update own words" ON words;
DROP POLICY IF EXISTS "Active Pro users can delete own words" ON words;
DROP POLICY IF EXISTS "Pro users can view words in shared projects" ON words;

CREATE POLICY "Active Pro users can create words in own projects"
  ON words FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND public.is_active_pro(s.status, s.plan, s.current_period_end)
    )
  );

CREATE POLICY "Active Pro users can update own words"
  ON words FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND public.is_active_pro(s.status, s.plan, s.current_period_end)
    )
  );

CREATE POLICY "Active Pro users can delete own words"
  ON words FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND public.is_active_pro(s.status, s.plan, s.current_period_end)
    )
  );

CREATE POLICY "Pro users can view words in shared projects"
  ON words FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = words.project_id
        AND p.share_id IS NOT NULL
    )
    AND EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND public.is_active_pro(s.status, s.plan, s.current_period_end)
    )
  );
