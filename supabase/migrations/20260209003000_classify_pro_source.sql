-- Classify current Pro users into billing/test sources
-- and make Pro checks source-aware.

-- ============================================
-- 1. Add source columns
-- ============================================
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pro_source TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS test_pro_expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_pro_source_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_pro_source_check
      CHECK (pro_source IN ('none', 'billing', 'test'));
  END IF;
END
$$;

UPDATE public.subscriptions
SET pro_source = CASE
  WHEN plan = 'pro'
    AND komoju_subscription_id IS NOT NULL
    AND komoju_subscription_id NOT LIKE 'manual_%' THEN 'billing'
  WHEN plan = 'pro' THEN 'test'
  ELSE 'none'
END
WHERE pro_source IS NULL
   OR pro_source NOT IN ('none', 'billing', 'test');

ALTER TABLE public.subscriptions
  ALTER COLUMN pro_source SET DEFAULT 'none',
  ALTER COLUMN pro_source SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_pro_source
  ON public.subscriptions (pro_source);

-- ============================================
-- 2. Source-aware Pro helper (5 args overload)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_active_pro(
  p_status TEXT,
  p_plan TEXT,
  p_current_period_end TIMESTAMPTZ,
  p_pro_source TEXT DEFAULT NULL,
  p_test_pro_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status <> 'active' OR p_plan <> 'pro' THEN false
    WHEN COALESCE(p_pro_source, 'billing') = 'test' THEN
      p_test_pro_expires_at IS NULL OR p_test_pro_expires_at > NOW()
    ELSE
      p_current_period_end IS NULL OR p_current_period_end > NOW()
  END;
$$;

-- ============================================
-- 3. Scan gate: use source-aware Pro helper
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

  SELECT public.is_active_pro(
    status,
    plan,
    current_period_end,
    pro_source,
    test_pro_expires_at
  )
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
--    use source-aware helper
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
        AND public.is_active_pro(
          s.status,
          s.plan,
          s.current_period_end,
          s.pro_source,
          s.test_pro_expires_at
        )
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
        AND public.is_active_pro(
          s.status,
          s.plan,
          s.current_period_end,
          s.pro_source,
          s.test_pro_expires_at
        )
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
        AND public.is_active_pro(
          s.status,
          s.plan,
          s.current_period_end,
          s.pro_source,
          s.test_pro_expires_at
        )
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
        AND public.is_active_pro(
          s.status,
          s.plan,
          s.current_period_end,
          s.pro_source,
          s.test_pro_expires_at
        )
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
        AND public.is_active_pro(
          s.status,
          s.plan,
          s.current_period_end,
          s.pro_source,
          s.test_pro_expires_at
        )
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
        AND public.is_active_pro(
          s.status,
          s.plan,
          s.current_period_end,
          s.pro_source,
          s.test_pro_expires_at
        )
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
        AND public.is_active_pro(
          s.status,
          s.plan,
          s.current_period_end,
          s.pro_source,
          s.test_pro_expires_at
        )
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
        AND public.is_active_pro(
          s.status,
          s.plan,
          s.current_period_end,
          s.pro_source,
          s.test_pro_expires_at
        )
    )
  );
