-- Manual-add morphology (語源解析) coin consumption: 1 coin per word.
--
-- Scanning charges morphology as a +2 surcharge on top of the mode cost
-- (20260712101000_morphology_coin_cost.sql). Manual word entry has no scan
-- mode, so it gets its own dedicated consume RPC that charges a flat
-- MANUAL_MORPHOLOGY_COIN_COST per word.
--
-- RATE TABLE — mirrored in src/lib/coins/rates.ts (MANUAL_MORPHOLOGY_COIN_COST);
-- a contract test reads this migration file and asserts the literal matches.
-- Change both together.
--   manual-add morphology = 1 coin / word
--
-- Policy (decided with product): coins are Pro-only, but manual add itself is a
-- core Free-tier feature and must never be blocked. So a Free user, or a Pro
-- user who is out of coins, gets `allowed:false` here (no charge, no error) and
-- the caller simply skips attaching morphology — the word is still saved.
-- Charging is best-effort and success-gated: the route only calls this after a
-- displayable morphology was produced, so users are only charged when they
-- actually receive an etymology breakdown.

-- ============================================
-- 1. Allow the new transaction type
-- ============================================

ALTER TABLE public.coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_type_check;

ALTER TABLE public.coin_transactions
  ADD CONSTRAINT coin_transactions_type_check CHECK (type IN (
    'monthly_grant',
    'scan_consume',
    'scan_refund',
    'pack_purchase',
    'admin_adjust',
    'manual_morphology_consume'
  ));

-- ============================================
-- 2. consume_manual_morphology_coins (authenticated)
-- ============================================

CREATE OR REPLACE FUNCTION public.consume_manual_morphology_coins(
  p_count INTEGER DEFAULT 1
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_count IS NULL OR p_count < 1 THEN
    RAISE EXCEPTION 'p_count must be >= 1';
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

  -- Free users get no coins: return allowed:false (NOT an error) so the caller
  -- skips morphology and still saves the word.
  IF NOT v_is_pro THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'requires_pro', true,
      'is_pro', false,
      'cost', p_count
    );
  END IF;

  -- MANUAL_MORPHOLOGY_COIN_COST = 1 per word (mirrored in src/lib/coins/rates.ts)
  v_cost := p_count * 1;

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

  -- Out of coins: skip (allowed:false), never block the manual add.
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
    (user_id, type, monthly_amount, purchased_amount, monthly_after, purchased_after, metadata)
  VALUES
    (v_user_id, 'manual_morphology_consume', -v_from_monthly, -v_from_purchased,
     v_balance.monthly_coins, v_balance.purchased_coins,
     jsonb_build_object('word_count', p_count, 'month_key', v_month));

  RETURN jsonb_build_object(
    'allowed', true,
    'requires_pro', false,
    'is_pro', true,
    'cost', v_cost,
    'monthly_remaining', v_balance.monthly_coins,
    'purchased_remaining', v_balance.purchased_coins,
    'total_remaining', v_balance.monthly_coins + v_balance.purchased_coins,
    'monthly_allowance', 300,
    'month_key', v_month
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_manual_morphology_coins(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_manual_morphology_coins(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
