-- Coin system fixes from adversarial review:
--
-- 1. refund_scan_coins: cross-month detection compared the consume's JST month
--    against the LAZILY-updated monthly_month_key. If the JST month rolled over
--    between consume and refund but the user had not yet triggered the lazy
--    grant, both sides still held the old month key, the refund landed in the
--    expired monthly bucket, and the next lazy grant (assignment to 300)
--    destroyed it. Compare against the CURRENT JST month instead.
--
-- 2. get_coin_balance: for users whose Pro lapsed, the lazy grant is skipped
--    but the RETURN still echoed the stale previous-month monthly bucket,
--    showing unspendable coins in the UI. Report 0 monthly when the stored
--    bucket belongs to an earlier month (the stored row is left untouched —
--    the lazy grant reconciles it when the user is Pro again).

CREATE OR REPLACE FUNCTION public.refund_scan_coins(p_scan_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consume public.coin_transactions%ROWTYPE;
  v_balance public.user_coin_balances%ROWTYPE;
  v_refund_monthly INTEGER;
  v_refund_purchased INTEGER;
  v_monthly_room INTEGER;
  v_overflow INTEGER;
  v_inserted UUID;
BEGIN
  IF p_scan_job_id IS NULL THEN
    RAISE EXCEPTION 'p_scan_job_id is required';
  END IF;

  SELECT * INTO v_consume
  FROM public.coin_transactions
  WHERE scan_job_id = p_scan_job_id
    AND type = 'scan_consume'
  LIMIT 1;

  IF NOT FOUND THEN
    -- Legacy / flag-off jobs never consumed — nothing to do.
    RETURN jsonb_build_object('refunded', false, 'reason', 'no_consume');
  END IF;

  SELECT * INTO v_balance
  FROM public.user_coin_balances
  WHERE user_id = v_consume.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'no_balance_row');
  END IF;

  v_refund_monthly := -v_consume.monthly_amount;
  v_refund_purchased := -v_consume.purchased_amount;

  -- Detect rollover by comparing the consume's JST month to the CURRENT JST
  -- month — NOT the stored monthly_month_key, which only advances lazily and
  -- would misclassify a refund that lands after midnight but before the next
  -- grant (the refunded coins would then be wiped by the grant's assignment).
  IF public.coin_month_key(v_consume.created_at) IS DISTINCT FROM public.coin_month_key() THEN
    -- The JST month rolled over between consume and refund: the monthly bucket
    -- for the consume month is gone, so credit everything to purchased
    -- (never short the user).
    v_refund_purchased := v_refund_purchased + v_refund_monthly;
    v_refund_monthly := 0;
  ELSE
    -- Same JST month: monthly_month_key necessarily equals the current month
    -- (it was set at consume time and only advances). Cap the monthly bucket
    -- at the allowance; overflow goes to purchased.
    v_monthly_room := GREATEST(0, 300 - v_balance.monthly_coins);
    v_overflow := GREATEST(0, v_refund_monthly - v_monthly_room);
    v_refund_monthly := v_refund_monthly - v_overflow;
    v_refund_purchased := v_refund_purchased + v_overflow;
  END IF;

  INSERT INTO public.coin_transactions
    (user_id, type, monthly_amount, purchased_amount, monthly_after, purchased_after,
     scan_job_id, metadata)
  VALUES
    (v_consume.user_id, 'scan_refund', v_refund_monthly, v_refund_purchased,
     v_balance.monthly_coins + v_refund_monthly,
     v_balance.purchased_coins + v_refund_purchased,
     p_scan_job_id,
     jsonb_build_object('consume_tx_id', v_consume.id))
  ON CONFLICT (scan_job_id) WHERE type = 'scan_refund' AND scan_job_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'already_refunded');
  END IF;

  UPDATE public.user_coin_balances
  SET monthly_coins = monthly_coins + v_refund_monthly,
      purchased_coins = purchased_coins + v_refund_purchased
  WHERE user_id = v_consume.user_id
  RETURNING * INTO v_balance;

  RETURN jsonb_build_object(
    'refunded', true,
    'monthly_remaining', v_balance.monthly_coins,
    'purchased_remaining', v_balance.purchased_coins
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_scan_coins(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_scan_coins(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_coin_balance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_pro BOOLEAN := FALSE;
  v_month TEXT := public.coin_month_key();
  v_balance public.user_coin_balances%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.is_active_pro(
    status,
    plan,
    current_period_end,
    pro_source,
    test_pro_expires_at
  )
    INTO v_is_pro
  FROM public.subscriptions
  WHERE user_id = v_user_id
  LIMIT 1;

  v_is_pro := COALESCE(v_is_pro, FALSE);

  INSERT INTO public.user_coin_balances (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_balance
  FROM public.user_coin_balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- Same lazy grant as consume_scan_coins, but only for Pro users.
  IF v_is_pro AND v_balance.monthly_month_key IS DISTINCT FROM v_month THEN
    v_balance.monthly_coins := 300;
    v_balance.monthly_month_key := v_month;

    UPDATE public.user_coin_balances
    SET monthly_coins = v_balance.monthly_coins,
        monthly_month_key = v_month
    WHERE user_id = v_user_id;

    INSERT INTO public.coin_transactions
      (user_id, type, monthly_amount, purchased_amount, monthly_after, purchased_after, metadata)
    VALUES
      (v_user_id, 'monthly_grant', 300, 0, v_balance.monthly_coins, v_balance.purchased_coins,
       jsonb_build_object('month_key', v_month));
  END IF;

  -- Stale bucket from an earlier month (non-Pro path skipped the grant):
  -- those coins are not spendable and will be overwritten by the next grant,
  -- so report 0 instead of a misleading leftover. The stored row is untouched.
  IF v_balance.monthly_month_key IS DISTINCT FROM v_month THEN
    v_balance.monthly_coins := 0;
  END IF;

  RETURN jsonb_build_object(
    'is_pro', v_is_pro,
    'monthly_remaining', v_balance.monthly_coins,
    'purchased_remaining', v_balance.purchased_coins,
    'total_remaining', v_balance.monthly_coins + v_balance.purchased_coins,
    'monthly_allowance', 300,
    'month_key', v_month
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_coin_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coin_balance() TO authenticated;
