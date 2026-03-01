-- Canonicalized from legacy 002_harden_subscriptions_and_webhooks.sql.
-- This keeps bootstrap compatibility without reusing the already-claimed
-- migration version prefix `002`.

-- Remove client-side update policy for subscriptions
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;

-- Allow authenticated users to cancel their own subscription via RPC only
CREATE OR REPLACE FUNCTION public.cancel_own_subscription()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET status = 'cancelled', updated_at = NOW()
  WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_own_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_own_subscription() TO authenticated;

-- Store webhook event ids to prevent replay
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Track subscription sessions to validate webhook session ids
CREATE TABLE IF NOT EXISTS public.subscription_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.subscription_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription sessions"
  ON public.subscription_sessions;

CREATE POLICY "Users can view own subscription sessions"
  ON public.subscription_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own subscription sessions"
  ON public.subscription_sessions;

CREATE POLICY "Users can create own subscription sessions"
  ON public.subscription_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
