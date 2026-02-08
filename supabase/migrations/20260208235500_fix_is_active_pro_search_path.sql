-- Ensure helper function has fixed search_path for security lint
CREATE OR REPLACE FUNCTION public.is_active_pro(
  p_status TEXT,
  p_plan TEXT,
  p_current_period_end TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT
    p_status = 'active'
    AND p_plan = 'pro'
    AND (
      p_current_period_end IS NULL
      OR p_current_period_end > NOW()
    );
$$;
