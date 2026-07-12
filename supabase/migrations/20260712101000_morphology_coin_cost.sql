-- Morphology (語源解析) scan option surcharge: +2 coins when enabled.
--
-- RATE TABLE — mirrored in src/lib/coins/rates.ts (MORPHOLOGY_COIN_COST); a
-- contract test reads this migration file and asserts the literal matches.
-- Change both together.
--   morphology option = +2
--
-- The old signatures MUST be dropped before recreation: CREATE OR REPLACE with
-- an added DEFAULT parameter would leave two overloads and PostgREST RPC
-- dispatch becomes ambiguous. Callers that omit p_include_morphology keep
-- working unchanged via the DEFAULT FALSE.

DROP FUNCTION IF EXISTS public.consume_scan_coins(TEXT[], INTEGER, UUID);
DROP FUNCTION IF EXISTS public.scan_coin_cost(TEXT[], INTEGER);

CREATE FUNCTION public.scan_coin_cost(
  p_modes TEXT[],
  p_image_count INTEGER,
  p_include_morphology BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_cost INTEGER := 0;
  v_mode_cost INTEGER;
  v_mode TEXT;
BEGIN
  IF p_modes IS NULL OR array_length(p_modes, 1) IS NULL THEN
    RAISE EXCEPTION 'p_modes must not be empty';
  END IF;
  IF p_image_count IS NULL OR p_image_count < 1 THEN
    RAISE EXCEPTION 'p_image_count must be >= 1';
  END IF;

  FOR v_mode IN SELECT DISTINCT unnest(p_modes) LOOP
    v_mode_cost := CASE v_mode
      WHEN 'circled' THEN 2
      WHEN 'all'     THEN 3
      WHEN 'eiken'   THEN 3
      WHEN 'idiom'   THEN 3
      ELSE NULL
    END;
    IF v_mode_cost IS NULL THEN
      RAISE EXCEPTION 'unknown scan mode: %', v_mode;
    END IF;
    v_cost := v_cost + v_mode_cost;
  END LOOP;

  RETURN v_cost + (p_image_count - 1)
    + (CASE WHEN COALESCE(p_include_morphology, FALSE) THEN 2 ELSE 0 END);
END;
$$;

CREATE FUNCTION public.consume_scan_coins(
  p_modes TEXT[],
  p_image_count INTEGER,
  p_scan_job_id UUID DEFAULT NULL,
  p_include_morphology BOOLEAN DEFAULT FALSE
)
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
  v_cost INTEGER;
  v_from_monthly INTEGER;
  v_from_purchased INTEGER;
  v_daily_count INTEGER := 0;
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

  IF NOT v_is_pro THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'requires_pro', true,
      'is_pro', false,
      'cost', NULL
    );
  END IF;

  v_cost := public.scan_coin_cost(p_modes, p_image_count, p_include_morphology);

  INSERT INTO public.user_coin_balances (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_balance
  FROM public.user_coin_balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- Lazy monthly grant: assignment (not +=) so unused coins never roll over.
  IF v_balance.monthly_month_key IS DISTINCT FROM v_month THEN
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

  IF v_balance.monthly_coins + v_balance.purchased_coins < v_cost THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'insufficient_coins',
      'requires_pro', false,
      'is_pro', true,
      'cost', v_cost,
      'monthly_remaining', v_balance.monthly_coins,
      'purchased_remaining', v_balance.purchased_coins,
      'total_remaining', v_balance.monthly_coins + v_balance.purchased_coins,
      'monthly_allowance', 300,
      'month_key', v_month
    );
  END IF;

  v_from_monthly := LEAST(v_balance.monthly_coins, v_cost);
  v_from_purchased := v_cost - v_from_monthly;

  UPDATE public.user_coin_balances
  SET monthly_coins = monthly_coins - v_from_monthly,
      purchased_coins = purchased_coins - v_from_purchased
  WHERE user_id = v_user_id
  RETURNING * INTO v_balance;

  INSERT INTO public.coin_transactions
    (user_id, type, monthly_amount, purchased_amount, monthly_after, purchased_after,
     scan_job_id, metadata)
  VALUES
    (v_user_id, 'scan_consume', -v_from_monthly, -v_from_purchased,
     v_balance.monthly_coins, v_balance.purchased_coins,
     p_scan_job_id,
     jsonb_build_object(
       'modes', to_jsonb(p_modes),
       'image_count', p_image_count,
       'include_morphology', COALESCE(p_include_morphology, FALSE),
       'month_key', v_month
     ));

  -- Keep the daily counter for ops continuity and legacy scanInfo.currentCount.
  INSERT INTO public.daily_scan_usage (user_id, scan_date, scan_count)
  VALUES (v_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, scan_date) DO NOTHING;

  UPDATE public.daily_scan_usage
  SET scan_count = scan_count + p_image_count
  WHERE user_id = v_user_id
    AND scan_date = CURRENT_DATE
  RETURNING scan_count INTO v_daily_count;

  RETURN jsonb_build_object(
    'allowed', true,
    'requires_pro', false,
    'is_pro', true,
    'cost', v_cost,
    'monthly_remaining', v_balance.monthly_coins,
    'purchased_remaining', v_balance.purchased_coins,
    'total_remaining', v_balance.monthly_coins + v_balance.purchased_coins,
    'monthly_allowance', 300,
    'month_key', v_month,
    'current_count', COALESCE(v_daily_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_scan_coins(TEXT[], INTEGER, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_scan_coins(TEXT[], INTEGER, UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
