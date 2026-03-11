-- Normalize legacy test subscriptions that still carry current_period_end from
-- pre-source-aware/manual billing rows. Test grants must use test_pro_expires_at.

UPDATE public.subscriptions
SET
  test_pro_expires_at = COALESCE(test_pro_expires_at, current_period_end),
  current_period_end = NULL,
  cancel_at_period_end = FALSE,
  cancel_requested_at = NULL,
  updated_at = NOW()
WHERE pro_source = 'test'
  AND current_period_end IS NOT NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_test_source_has_no_current_period_end;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_test_source_has_no_current_period_end
  CHECK (
    pro_source <> 'test'
    OR current_period_end IS NULL
  );
