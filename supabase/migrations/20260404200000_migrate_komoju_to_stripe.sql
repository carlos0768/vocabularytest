-- Migrate payment provider: KOMOJU → Stripe
-- Renames columns, updates CHECK constraints, rebuilds indexes, and rewrites claim RPC.

-- ============================================
-- 1) subscriptions: rename KOMOJU columns to Stripe
-- ============================================
ALTER TABLE public.subscriptions
  RENAME COLUMN komoju_subscription_id TO stripe_subscription_id;
ALTER TABLE public.subscriptions
  RENAME COLUMN komoju_customer_id TO stripe_customer_id;

-- Drop old partial unique indexes
DROP INDEX IF EXISTS idx_subscriptions_komoju_subscription_unique;
DROP INDEX IF EXISTS idx_subscriptions_komoju_customer_unique;

-- Recreate with new column names
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_unique
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_unique
  ON public.subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Drop old CHECK constraint and create new one for Stripe ID format (sub_ prefix)
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_requires_live_komoju_id;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_requires_live_stripe_id
  CHECK (
    pro_source <> 'billing'
    OR (
      stripe_subscription_id IS NOT NULL
      AND stripe_subscription_id NOT LIKE 'manual_%'
    )
  );

-- ============================================
-- 2) subscription_sessions: rename KOMOJU columns to Stripe
-- ============================================
ALTER TABLE public.subscription_sessions
  RENAME COLUMN komoju_customer_id TO stripe_customer_id;
ALTER TABLE public.subscription_sessions
  RENAME COLUMN komoju_subscription_id TO stripe_subscription_id;

-- ============================================
-- 3) Rebuild claim_subscription_session with new column names
-- ============================================
CREATE OR REPLACE FUNCTION public.claim_subscription_session(
  p_session_id TEXT,
  p_user_id UUID,
  p_stale_after_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  id TEXT,
  status TEXT,
  used_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
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
      v_row.stripe_customer_id,
      v_row.stripe_subscription_id,
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
      v_row.stripe_customer_id,
      v_row.stripe_subscription_id,
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
    v_row.stripe_customer_id,
    v_row.stripe_subscription_id,
    TRUE,
    'claim_granted';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_subscription_session(TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_subscription_session(TEXT, UUID, INTEGER) TO service_role;
