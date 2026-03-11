-- Feature-level daily usage tracking for AI endpoints (translate/examples/dictation).

CREATE TABLE IF NOT EXISTS public.feature_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, feature_key, usage_date)
);
CREATE INDEX IF NOT EXISTS idx_feature_usage_daily_user_feature_date
  ON public.feature_usage_daily (user_id, feature_key, usage_date DESC);
ALTER TABLE public.feature_usage_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own feature usage"
  ON public.feature_usage_daily;
CREATE POLICY "Users can view own feature usage"
  ON public.feature_usage_daily
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own feature usage"
  ON public.feature_usage_daily;
DROP POLICY IF EXISTS "Users can update own feature usage"
  ON public.feature_usage_daily;
DROP TRIGGER IF EXISTS update_feature_usage_daily_updated_at
  ON public.feature_usage_daily;
CREATE TRIGGER update_feature_usage_daily_updated_at
  BEFORE UPDATE ON public.feature_usage_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.check_and_increment_feature_usage(TEXT, BOOLEAN, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.check_and_increment_feature_usage(
  p_feature_key TEXT,
  p_require_pro BOOLEAN DEFAULT FALSE,
  p_free_limit INTEGER DEFAULT 0,
  p_pro_limit INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_pro BOOLEAN := FALSE;
  v_limit INTEGER;
  v_current_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_feature_key IS NULL OR btrim(p_feature_key) = '' THEN
    RAISE EXCEPTION 'feature_key is required';
  END IF;

  SELECT public.is_active_pro(
    status,
    plan,
    current_period_end,
    pro_source,
    test_pro_expires_at
  )
    INTO v_is_pro
  FROM public.subscriptions
  WHERE user_id = v_user_id
  LIMIT 1;

  v_is_pro := COALESCE(v_is_pro, FALSE);

  IF p_require_pro AND NOT v_is_pro THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'requires_pro', true,
      'current_count', 0,
      'limit', CASE WHEN p_free_limit > 0 THEN p_free_limit ELSE NULL END,
      'is_pro', v_is_pro
    );
  END IF;

  IF v_is_pro THEN
    v_limit := CASE WHEN p_pro_limit > 0 THEN p_pro_limit ELSE NULL END;
  ELSE
    v_limit := CASE WHEN p_free_limit > 0 THEN p_free_limit ELSE NULL END;
  END IF;

  INSERT INTO public.feature_usage_daily (user_id, feature_key, usage_date, usage_count)
  VALUES (v_user_id, p_feature_key, CURRENT_DATE, 0)
  ON CONFLICT (user_id, feature_key, usage_date) DO NOTHING;

  UPDATE public.feature_usage_daily
  SET usage_count = usage_count + 1
  WHERE user_id = v_user_id
    AND feature_key = p_feature_key
    AND usage_date = CURRENT_DATE
    AND (v_limit IS NULL OR usage_count < v_limit)
  RETURNING usage_count INTO v_current_count;

  IF NOT FOUND THEN
    SELECT usage_count
      INTO v_current_count
    FROM public.feature_usage_daily
    WHERE user_id = v_user_id
      AND feature_key = p_feature_key
      AND usage_date = CURRENT_DATE;

    RETURN jsonb_build_object(
      'allowed', false,
      'requires_pro', false,
      'current_count', COALESCE(v_current_count, 0),
      'limit', v_limit,
      'is_pro', v_is_pro
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'requires_pro', false,
    'current_count', v_current_count,
    'limit', v_limit,
    'is_pro', v_is_pro
  );
END;
$$;
REVOKE ALL ON FUNCTION public.check_and_increment_feature_usage(TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_feature_usage(TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated;
