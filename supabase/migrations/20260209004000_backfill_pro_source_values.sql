-- Backfill existing Pro rows into billing/test source buckets
UPDATE public.subscriptions
SET pro_source = CASE
  WHEN komoju_subscription_id IS NOT NULL
    AND komoju_subscription_id NOT LIKE 'manual_%' THEN 'billing'
  ELSE 'test'
END
WHERE plan = 'pro'
  AND pro_source = 'none';
