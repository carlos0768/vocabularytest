-- Reclassify manual placeholder subscription ids as test grants
UPDATE public.subscriptions
SET pro_source = 'test'
WHERE plan = 'pro'
  AND pro_source = 'billing'
  AND komoju_subscription_id LIKE 'manual_%';
