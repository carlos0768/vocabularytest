-- Track per-call API cost events for OpenAI/Gemini and related providers.

CREATE TABLE IF NOT EXISTS public.api_cost_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  endpoint TEXT,
  status TEXT NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('succeeded', 'failed')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd NUMERIC(18, 8),
  estimated_cost_jpy NUMERIC(18, 4),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_cost_events_created_at
  ON public.api_cost_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_cost_events_user_created_at
  ON public.api_cost_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_cost_events_provider_model_created_at
  ON public.api_cost_events (provider, model, created_at DESC);

ALTER TABLE public.api_cost_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to api_cost_events"
  ON public.api_cost_events;

CREATE POLICY "Service role full access to api_cost_events"
  ON public.api_cost_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own api cost events"
  ON public.api_cost_events;

CREATE POLICY "Users can view own api cost events"
  ON public.api_cost_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
