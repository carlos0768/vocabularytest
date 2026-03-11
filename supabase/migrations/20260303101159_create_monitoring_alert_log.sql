-- Table for tracking sent monitoring alerts (deduplication)
CREATE TABLE public.monitoring_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  alert_date DATE NOT NULL,
  cost_jpy NUMERIC(18, 4),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(alert_type, alert_date)
);

-- Enable RLS — only service role can access
ALTER TABLE public.monitoring_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.monitoring_alert_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);;
