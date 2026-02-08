-- KOMOJU hardening:
-- - idempotent session creation metadata
-- - webhook processing state and atomic claim
-- - source classification guardrails
-- - test Pro grant/revoke RPCs

-- ============================================
-- 1) subscription_sessions: idempotency metadata
-- ============================================
ALTER TABLE public.subscription_sessions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_sessions_idempotency_key_unique
  ON public.subscription_sessions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_sessions_pending_lookup
  ON public.subscription_sessions (user_id, plan_id, created_at DESC)
  WHERE used_at IS NULL;

-- ============================================
-- 2) webhook_events: stateful processing columns
-- ============================================
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.webhook_events
SET
  status = COALESCE(status, 'processed'),
  attempt_count = COALESCE(attempt_count, 1),
  processed_at = COALESCE(processed_at, received_at),
  updated_at = COALESCE(updated_at, received_at)
WHERE
  status IS NULL
  OR attempt_count IS NULL
  OR processed_at IS NULL
  OR updated_at IS NULL;

ALTER TABLE public.webhook_events
  ALTER COLUMN status SET DEFAULT 'processed',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN attempt_count SET DEFAULT 1,
  ALTER COLUMN attempt_count SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'webhook_events_status_check'
      AND conrelid = 'public.webhook_events'::regclass
  ) THEN
    ALTER TABLE public.webhook_events
      ADD CONSTRAINT webhook_events_status_check
      CHECK (status IN ('processing', 'processed', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_updated_at
  ON public.webhook_events (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON public.webhook_events (received_at DESC);

-- Atomic claim helper for webhook processing.
CREATE OR REPLACE FUNCTION public.claim_webhook_event(
  p_id TEXT,
  p_type TEXT,
  p_payload_hash TEXT,
  p_stale_after_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  id TEXT,
  status TEXT,
  attempt_count INTEGER,
  should_process BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.webhook_events%ROWTYPE;
  v_inserted_count INTEGER := 0;
  v_stale_after INTERVAL := make_interval(secs => GREATEST(p_stale_after_seconds, 1));
BEGIN
  INSERT INTO public.webhook_events (
    id,
    type,
    status,
    attempt_count,
    payload_hash,
    received_at,
    updated_at,
    processed_at,
    last_error
  )
  VALUES (
    p_id,
    p_type,
    'processing',
    1,
    p_payload_hash,
    NOW(),
    NOW(),
    NULL,
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  SELECT *
  INTO v_row
  FROM public.webhook_events
  WHERE webhook_events.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook event not found for id %', p_id;
  END IF;

  IF v_inserted_count > 0 THEN
    RETURN QUERY SELECT v_row.id, v_row.status, v_row.attempt_count, TRUE;
    RETURN;
  END IF;

  IF v_row.status = 'processed' THEN
    RETURN QUERY SELECT v_row.id, v_row.status, v_row.attempt_count, FALSE;
    RETURN;
  END IF;

  IF v_row.status = 'processing'
     AND v_row.updated_at >= NOW() - v_stale_after THEN
    RETURN QUERY SELECT v_row.id, v_row.status, v_row.attempt_count, FALSE;
    RETURN;
  END IF;

  UPDATE public.webhook_events
  SET
    type = COALESCE(NULLIF(p_type, ''), v_row.type),
    status = 'processing',
    attempt_count = COALESCE(v_row.attempt_count, 0) + 1,
    payload_hash = COALESCE(NULLIF(p_payload_hash, ''), v_row.payload_hash),
    processed_at = NULL,
    last_error = NULL,
    updated_at = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.status, v_row.attempt_count, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_webhook_event(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_webhook_event(TEXT, TEXT, TEXT, INTEGER) TO service_role;

-- ============================================
-- 3) subscriptions: uniqueness and classification guardrails
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_komoju_subscription_unique
  ON public.subscriptions (komoju_subscription_id)
  WHERE komoju_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_komoju_customer_unique
  ON public.subscriptions (komoju_customer_id)
  WHERE komoju_customer_id IS NOT NULL;

UPDATE public.subscriptions
SET
  pro_source = CASE
    WHEN plan = 'pro'
      AND komoju_subscription_id IS NOT NULL
      AND komoju_subscription_id NOT LIKE 'manual_%' THEN 'billing'
    WHEN plan = 'pro' THEN 'test'
    ELSE 'none'
  END,
  test_pro_expires_at = CASE
    WHEN plan = 'pro'
      AND komoju_subscription_id IS NOT NULL
      AND komoju_subscription_id NOT LIKE 'manual_%' THEN NULL
    ELSE test_pro_expires_at
  END
WHERE
  plan <> 'free'
  OR pro_source <> 'none'
  OR plan = 'pro';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_billing_requires_live_komoju_id'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billing_requires_live_komoju_id
      CHECK (
        pro_source <> 'billing'
        OR (
          komoju_subscription_id IS NOT NULL
          AND komoju_subscription_id NOT LIKE 'manual_%'
        )
      );
  END IF;
END
$$;

-- ============================================
-- 4) Test Pro operations (default 90 days)
-- ============================================
CREATE OR REPLACE FUNCTION public.grant_test_pro(
  p_user_id UUID,
  p_permanent BOOLEAN DEFAULT FALSE,
  p_duration_days INTEGER DEFAULT 90
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.subscriptions%ROWTYPE;
  v_updated public.subscriptions%ROWTYPE;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF NOT p_permanent AND p_duration_days < 1 THEN
    RAISE EXCEPTION 'p_duration_days must be >= 1 when p_permanent is false';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription row not found for user %', p_user_id;
  END IF;

  IF v_existing.status = 'active'
     AND v_existing.plan = 'pro'
     AND v_existing.pro_source = 'billing' THEN
    RAISE EXCEPTION 'cannot override active billing subscription for user %', p_user_id;
  END IF;

  v_expires_at := CASE
    WHEN p_permanent THEN NULL
    ELSE NOW() + make_interval(days => p_duration_days)
  END;

  UPDATE public.subscriptions
  SET
    status = 'active',
    plan = 'pro',
    pro_source = 'test',
    test_pro_expires_at = v_expires_at,
    cancel_at_period_end = FALSE,
    cancel_requested_at = NULL,
    current_period_start = COALESCE(current_period_start, NOW()),
    current_period_end = NULL,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_test_pro(
  p_user_id UUID
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.subscriptions%ROWTYPE;
  v_updated public.subscriptions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription row not found for user %', p_user_id;
  END IF;

  IF v_existing.pro_source <> 'test' THEN
    RETURN v_existing;
  END IF;

  UPDATE public.subscriptions
  SET
    status = 'free',
    plan = 'free',
    pro_source = 'none',
    test_pro_expires_at = NULL,
    cancel_at_period_end = FALSE,
    cancel_requested_at = NULL,
    current_period_start = NULL,
    current_period_end = NULL,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_test_pro(UUID, BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_test_pro(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_test_pro(UUID, BOOLEAN, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_test_pro(UUID) TO service_role;
