-- iOS scan backendization support:
-- 1) scan_jobs save mode + optional target project reference
-- 2) batch scan usage RPC so 1 image = 1 consumption in a single atomic request

ALTER TABLE public.scan_jobs
ADD COLUMN IF NOT EXISTS target_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.scan_jobs
ADD COLUMN IF NOT EXISTS save_mode TEXT NOT NULL DEFAULT 'server_cloud';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scan_jobs_save_mode_check'
      AND conrelid = 'public.scan_jobs'::regclass
  ) THEN
    ALTER TABLE public.scan_jobs
      ADD CONSTRAINT scan_jobs_save_mode_check
      CHECK (save_mode IN ('server_cloud', 'client_local'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_scan_jobs_target_project_id
  ON public.scan_jobs (target_project_id)
  WHERE target_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_jobs_user_status_updated
  ON public.scan_jobs (user_id, status, updated_at DESC);
DROP FUNCTION IF EXISTS public.check_and_increment_scan_batch(INTEGER, BOOLEAN);
CREATE OR REPLACE FUNCTION public.check_and_increment_scan_batch(
  p_count INTEGER,
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
  v_current_count INTEGER := 0;
  v_new_count INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_count IS NULL OR p_count <= 0 THEN
    RAISE EXCEPTION 'p_count must be greater than 0';
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

  INSERT INTO public.daily_scan_usage (user_id, scan_date, scan_count)
  VALUES (v_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, scan_date) DO NOTHING;

  SELECT scan_count
    INTO v_current_count
  FROM public.daily_scan_usage
  WHERE user_id = v_user_id
    AND scan_date = CURRENT_DATE
  FOR UPDATE;

  v_current_count := COALESCE(v_current_count, 0);

  IF v_limit IS NOT NULL AND v_current_count + p_count > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current_count', v_current_count,
      'limit', v_limit,
      'is_pro', v_is_pro,
      'requires_pro', false
    );
  END IF;

  UPDATE public.daily_scan_usage
  SET scan_count = v_current_count + p_count
  WHERE user_id = v_user_id
    AND scan_date = CURRENT_DATE
  RETURNING scan_count INTO v_new_count;

  RETURN jsonb_build_object(
    'allowed', true,
    'current_count', v_new_count,
    'limit', v_limit,
    'is_pro', v_is_pro,
    'requires_pro', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.check_and_increment_scan_batch(INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_scan_batch(INTEGER, BOOLEAN) TO authenticated;
