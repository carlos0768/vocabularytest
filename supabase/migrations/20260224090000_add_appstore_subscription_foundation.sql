-- Add App Store subscription foundation while keeping KOMOJU billing flow intact.
-- Phase 1 scope:
-- - extend pro_source classification
-- - add App Store identification columns
-- - add constraints/indexes for App Store source safety
-- - keep existing billing guardrails unchanged

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS appstore_original_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS appstore_latest_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS appstore_product_id TEXT,
  ADD COLUMN IF NOT EXISTS appstore_environment TEXT,
  ADD COLUMN IF NOT EXISTS appstore_last_verified_at TIMESTAMPTZ;

UPDATE public.subscriptions
SET pro_source = 'none'
WHERE pro_source IS NULL
   OR pro_source NOT IN ('none', 'billing', 'test', 'appstore');

ALTER TABLE public.subscriptions
  ALTER COLUMN pro_source SET DEFAULT 'none',
  ALTER COLUMN pro_source SET NOT NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_pro_source_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_pro_source_check
  CHECK (pro_source IN ('none', 'billing', 'test', 'appstore'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_appstore_original_transaction_unique
  ON public.subscriptions (appstore_original_transaction_id)
  WHERE appstore_original_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_appstore_latest_transaction_idx
  ON public.subscriptions (appstore_latest_transaction_id)
  WHERE appstore_latest_transaction_id IS NOT NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_appstore_environment_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_appstore_environment_check
  CHECK (
    appstore_environment IS NULL
    OR appstore_environment IN ('sandbox', 'production')
  );

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_appstore_requires_original_transaction_id;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_appstore_requires_original_transaction_id
  CHECK (
    pro_source <> 'appstore'
    OR NULLIF(BTRIM(appstore_original_transaction_id), '') IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.is_active_pro(
  p_status TEXT,
  p_plan TEXT,
  p_current_period_end TIMESTAMPTZ,
  p_pro_source TEXT DEFAULT NULL,
  p_test_pro_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status <> 'active' OR p_plan <> 'pro' THEN false
    WHEN COALESCE(p_pro_source, 'billing') = 'test' THEN
      p_test_pro_expires_at IS NULL OR p_test_pro_expires_at > NOW()
    WHEN COALESCE(p_pro_source, 'billing') IN ('billing', 'appstore') THEN
      p_current_period_end IS NULL OR p_current_period_end > NOW()
    WHEN COALESCE(p_pro_source, 'billing') = 'none' THEN false
    ELSE
      p_current_period_end IS NULL OR p_current_period_end > NOW()
  END;
$$;
