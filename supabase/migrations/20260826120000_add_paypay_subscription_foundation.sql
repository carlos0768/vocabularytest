-- Add PayPay recurring subscription foundation (Phase 1).
-- Mirrors 20260224090000_add_appstore_subscription_foundation.sql:
-- - extend pro_source classification with 'paypay'
-- - add PayPay identification columns
-- - add constraints/indexes for PayPay source safety
-- - keep existing Stripe/App Store guardrails unchanged
--
-- Naming note: the source is named after the payment method ('paypay'), not the
-- gateway, because Stripe cannot do PayPay recurring and the gateway that can
-- (GMO PG or KOMOJU) is a swappable implementation detail. The gateway is stored
-- as data in paypay_provider so switching it never needs another migration.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paypay_provider TEXT,
  ADD COLUMN IF NOT EXISTS paypay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS paypay_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS paypay_last_verified_at TIMESTAMPTZ;

UPDATE public.subscriptions
SET pro_source = 'none'
WHERE pro_source IS NULL
   OR pro_source NOT IN ('none', 'billing', 'test', 'appstore', 'paypay');

ALTER TABLE public.subscriptions
  ALTER COLUMN pro_source SET DEFAULT 'none',
  ALTER COLUMN pro_source SET NOT NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_pro_source_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_pro_source_check
  CHECK (pro_source IN ('none', 'billing', 'test', 'appstore', 'paypay'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_paypay_provider_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_paypay_provider_check
  CHECK (
    paypay_provider IS NULL
    OR paypay_provider IN ('gmo', 'komoju')
  );

-- A 'paypay' row without the gateway's recurring-contract id cannot be
-- reconciled or cancelled, so refuse to store one (same shape as the
-- appstore_original_transaction_id guard).
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_paypay_requires_subscription_id;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_paypay_requires_subscription_id
  CHECK (
    pro_source <> 'paypay'
    OR (
      NULLIF(BTRIM(paypay_subscription_id), '') IS NOT NULL
      AND paypay_provider IS NOT NULL
    )
  );

-- One gateway contract maps to at most one user — the uniqueness that makes
-- notification handling idempotent when the same contract is replayed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_paypay_subscription_unique
  ON public.subscriptions (paypay_provider, paypay_subscription_id)
  WHERE paypay_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_paypay_customer_idx
  ON public.subscriptions (paypay_customer_id)
  WHERE paypay_customer_id IS NOT NULL;

-- 'paypay' entitlement is period-based, exactly like 'billing' and 'appstore'.
-- Every RLS write policy calls this function, so adding the branch here is what
-- makes PayPay Pro users able to write at all.
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
    WHEN COALESCE(p_pro_source, 'billing') IN ('billing', 'appstore', 'paypay') THEN
      p_current_period_end IS NULL OR p_current_period_end > NOW()
    WHEN COALESCE(p_pro_source, 'billing') = 'none' THEN false
    ELSE
      p_current_period_end IS NULL OR p_current_period_end > NOW()
  END;
$$;
