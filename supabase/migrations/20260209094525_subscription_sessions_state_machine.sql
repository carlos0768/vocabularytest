-- subscription_sessions state machine + row-claim RPC for activation races

ALTER TABLE public.subscription_sessions
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_message TEXT,
  ADD COLUMN IF NOT EXISTS last_event_type TEXT,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.subscription_sessions
SET
  status = CASE
    WHEN used_at IS NOT NULL THEN 'succeeded'
    WHEN status IN ('pending', 'succeeded', 'failed', 'cancelled') THEN status
    ELSE 'pending'
  END,
  updated_at = COALESCE(updated_at, used_at, created_at, NOW())
WHERE
  status IS NULL
  OR status NOT IN ('pending', 'succeeded', 'failed', 'cancelled')
  OR updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscription_sessions_status_check'
      AND conrelid = 'public.subscription_sessions'::regclass
  ) THEN
    ALTER TABLE public.subscription_sessions
      ADD CONSTRAINT subscription_sessions_status_check
      CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled'));
  END IF;
END
$$;

ALTER TABLE public.subscription_sessions
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_sessions_status_updated_at
  ON public.subscription_sessions (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_sessions_user_status_created_at
  ON public.subscription_sessions (user_id, status, created_at DESC);

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
  FROM public.subscription_sessions
  WHERE id = p_session_id
    AND user_id = p_user_id
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

  UPDATE public.subscription_sessions
  SET
    status = 'pending',
    processing_started_at = NOW(),
    updated_at = NOW()
  WHERE id = v_row.id
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
