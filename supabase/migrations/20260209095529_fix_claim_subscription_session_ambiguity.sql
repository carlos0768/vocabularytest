-- Fix ambiguous column reference in claim_subscription_session()

CREATE OR REPLACE FUNCTION public.claim_subscription_session(
  p_session_id TEXT,
  p_user_id UUID,
  p_stale_after_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  id TEXT,
  status TEXT,
  used_at TIMESTAMPTZ,
  komoju_customer_id TEXT,
  komoju_subscription_id TEXT,
  should_process BOOLEAN,
  claim_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.subscription_sessions%ROWTYPE;
  v_stale_after INTERVAL := make_interval(secs => GREATEST(p_stale_after_seconds, 1));
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'p_session_id is required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT *
  INTO v_row
  FROM public.subscription_sessions AS ss
  WHERE ss.id = p_session_id
    AND ss.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription session not found for id % and user %', p_session_id, p_user_id;
  END IF;

  IF v_row.used_at IS NOT NULL OR v_row.status = 'succeeded' OR v_row.status = 'cancelled' THEN
    RETURN QUERY
    SELECT
      v_row.id,
      v_row.status,
      v_row.used_at,
      v_row.komoju_customer_id,
      v_row.komoju_subscription_id,
      FALSE,
      CASE
        WHEN v_row.status = 'cancelled' THEN 'cancelled'
        ELSE 'already_succeeded'
      END;
    RETURN;
  END IF;

  IF v_row.processing_started_at IS NOT NULL
     AND v_row.processing_started_at >= NOW() - v_stale_after THEN
    RETURN QUERY
    SELECT
      v_row.id,
      v_row.status,
      v_row.used_at,
      v_row.komoju_customer_id,
      v_row.komoju_subscription_id,
      FALSE,
      'in_progress';
    RETURN;
  END IF;

  UPDATE public.subscription_sessions AS ss
  SET
    status = 'pending',
    processing_started_at = NOW(),
    updated_at = NOW()
  WHERE ss.id = v_row.id
  RETURNING * INTO v_row;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.status,
    v_row.used_at,
    v_row.komoju_customer_id,
    v_row.komoju_subscription_id,
    TRUE,
    'claim_granted';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_subscription_session(TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_subscription_session(TEXT, UUID, INTEGER) TO service_role;
