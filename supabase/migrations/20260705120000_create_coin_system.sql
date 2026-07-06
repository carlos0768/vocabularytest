-- Coin-based scan consumption system.
--
-- Pro users receive 300 coins per JST calendar month (lazy grant, no cron).
-- Scans consume coins by mode (circled=2, all/eiken/idiom=3, composite=sum,
-- +1 per image beyond the first). Purchased coins never expire and are spent
-- after monthly coins. All writes go through SECURITY DEFINER RPCs — the
-- authenticated role has SELECT-only access to these tables.
--
-- Month boundary is the JST (Asia/Tokyo) calendar month, NOT UTC: the
-- monthly reset happens at 00:00 JST on the 1st. Using UTC here would roll
-- the month 9 hours late for Japanese users.

-- ============================================
-- 1. Month key helper (single source of truth)
-- ============================================

CREATE OR REPLACE FUNCTION public.coin_month_key(p_at TIMESTAMPTZ DEFAULT now())
RETURNS TEXT
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT to_char(p_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM');
$$;

-- ============================================
-- 2. Tables
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_coin_balances (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_coins      INTEGER NOT NULL DEFAULT 0 CHECK (monthly_coins >= 0),
  purchased_coins    INTEGER NOT NULL DEFAULT 0 CHECK (purchased_coins >= 0),
  monthly_month_key  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type              TEXT NOT NULL CHECK (type IN
                      ('monthly_grant', 'scan_consume', 'scan_refund', 'pack_purchase', 'admin_adjust')),
  monthly_amount    INTEGER NOT NULL DEFAULT 0,
  purchased_amount  INTEGER NOT NULL DEFAULT 0,
  monthly_after     INTEGER NOT NULL,
  purchased_after   INTEGER NOT NULL,
  -- Intentionally no FK: the consume happens before the scan_jobs row is inserted.
  scan_job_id       UUID,
  provider          TEXT CHECK (provider IS NULL OR provider IN ('stripe', 'gmo_paypay')),
  external_ref      TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_created
  ON public.coin_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_scan_job
  ON public.coin_transactions (scan_job_id)
  WHERE scan_job_id IS NOT NULL;

-- Idempotency backstops: at most one consume and one refund per scan job,
-- at most one credit per (provider, external payment reference).
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_tx_one_consume_per_job
  ON public.coin_transactions (scan_job_id)
  WHERE type = 'scan_consume' AND scan_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_tx_one_refund_per_job
  ON public.coin_transactions (scan_job_id)
  WHERE type = 'scan_refund' AND scan_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_tx_unique_purchase_ref
  ON public.coin_transactions (provider, external_ref)
  WHERE type = 'pack_purchase' AND external_ref IS NOT NULL;

-- updated_at trigger (shared helper from 001_initial_schema.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_user_coin_balances_updated_at'
      AND tgrelid = 'public.user_coin_balances'::regclass
  ) THEN
    CREATE TRIGGER update_user_coin_balances_updated_at
      BEFORE UPDATE ON public.user_coin_balances
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- 3. RLS: SELECT-own only; writes exclusively via RPCs / service role
-- ============================================

ALTER TABLE public.user_coin_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_coin_balances'
      AND policyname = 'Users can view own coin balance'
  ) THEN
    CREATE POLICY "Users can view own coin balance"
      ON public.user_coin_balances FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_coin_balances'
      AND policyname = 'Service role can manage coin balances'
  ) THEN
    CREATE POLICY "Service role can manage coin balances"
      ON public.user_coin_balances FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coin_transactions'
      AND policyname = 'Users can view own coin transactions'
  ) THEN
    CREATE POLICY "Users can view own coin transactions"
      ON public.coin_transactions FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coin_transactions'
      AND policyname = 'Service role can manage coin transactions'
  ) THEN
    CREATE POLICY "Service role can manage coin transactions"
      ON public.coin_transactions FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- 4. Cost function
-- ============================================
-- RATE TABLE — mirrored in src/lib/coins/rates.ts; a contract test reads this
-- migration file and asserts the literals match. Change both together.
--   circled = 2, all = 3, eiken = 3, idiom = 3
--   extra image beyond the first = +1
--   monthly allowance = 300

CREATE OR REPLACE FUNCTION public.scan_coin_cost(p_modes TEXT[], p_image_count INTEGER)
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

  RETURN v_cost + (p_image_count - 1);
END;
$$;

-- ============================================
-- 5. consume_scan_coins (authenticated)
-- ============================================

CREATE OR REPLACE FUNCTION public.consume_scan_coins(
  p_modes TEXT[],
  p_image_count INTEGER,
  p_scan_job_id UUID DEFAULT NULL
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

  v_cost := public.scan_coin_cost(p_modes, p_image_count);

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

REVOKE ALL ON FUNCTION public.consume_scan_coins(TEXT[], INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_scan_coins(TEXT[], INTEGER, UUID) TO authenticated;

-- ============================================
-- 6. refund_scan_coins (service role only)
-- ============================================
-- Refund policy: full refund only when the whole scan job fails.
-- Partial failures (some images fail but the job produces words) do not refund.

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

  IF public.coin_month_key(v_consume.created_at) IS DISTINCT FROM v_balance.monthly_month_key THEN
    -- The JST month rolled over between consume and refund: the monthly bucket
    -- was already reset, so credit everything to purchased (never short the user).
    v_refund_purchased := v_refund_purchased + v_refund_monthly;
    v_refund_monthly := 0;
  ELSE
    -- Cap the monthly bucket at the allowance; overflow goes to purchased.
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

-- ============================================
-- 7. credit_coin_pack (service role only)
-- ============================================
-- Provider-agnostic: Stripe today, GMO PayPay later — both funnel here.
-- Idempotent per (provider, external_ref) via the partial unique index.

CREATE OR REPLACE FUNCTION public.credit_coin_pack(
  p_user_id UUID,
  p_coins INTEGER,
  p_provider TEXT,
  p_external_ref TEXT,
  p_pack_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance public.user_coin_balances%ROWTYPE;
  v_inserted UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  IF p_coins IS NULL OR p_coins <= 0 THEN
    RAISE EXCEPTION 'p_coins must be greater than 0';
  END IF;
  IF p_external_ref IS NULL OR BTRIM(p_external_ref) = '' THEN
    RAISE EXCEPTION 'p_external_ref is required';
  END IF;

  INSERT INTO public.user_coin_balances (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_balance
  FROM public.user_coin_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  INSERT INTO public.coin_transactions
    (user_id, type, monthly_amount, purchased_amount, monthly_after, purchased_after,
     provider, external_ref, metadata)
  VALUES
    (p_user_id, 'pack_purchase', 0, p_coins,
     v_balance.monthly_coins, v_balance.purchased_coins + p_coins,
     p_provider, p_external_ref,
     jsonb_build_object('pack_id', p_pack_id))
  ON CONFLICT (provider, external_ref) WHERE type = 'pack_purchase' AND external_ref IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'duplicate');
  END IF;

  UPDATE public.user_coin_balances
  SET purchased_coins = purchased_coins + p_coins
  WHERE user_id = p_user_id
  RETURNING * INTO v_balance;

  RETURN jsonb_build_object(
    'credited', true,
    'purchased_remaining', v_balance.purchased_coins,
    'total_remaining', v_balance.monthly_coins + v_balance.purchased_coins
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_coin_pack(UUID, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_coin_pack(UUID, INTEGER, TEXT, TEXT, TEXT) TO service_role;

-- ============================================
-- 8. get_coin_balance (authenticated)
-- ============================================

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
