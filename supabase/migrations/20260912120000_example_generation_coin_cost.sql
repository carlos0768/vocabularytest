-- Example sentence (例文生成) becomes an opt-in scan option with a coin surcharge.
--
-- RATE TABLE — mirrored in src/lib/coins/rates.ts; a contract test reads this
-- migration file and asserts the literals match. Change both together.
--   scan option surcharge = +2  (flat, per scan — same shape as morphology)
--
-- これまで例文生成は「常時オン・無料」だった。選択式にするのに合わせて、
-- 語源解析と同じ +2 のサーチャージに揃える。既定はオフなので、何も選ばずに
-- スキャンした場合のコストは従来と変わらない。
--
-- p_include_derived_words は引数として残すが、加算はもうしない。派生語機能は
-- 削除済みなので課金する対象が無い。引数を消さないのは、このマイグレーションを
-- 適用したあと旧サーバーがまだ動いている時間帯に、旧サーバーが送ってくる
-- p_include_derived_words で PGRST202 が出てスキャンが全部落ちるのを避けるため。
--
-- The old scan signatures MUST be dropped before recreation: CREATE OR REPLACE
-- with an added DEFAULT parameter would leave two overloads and PostgREST RPC
-- dispatch becomes ambiguous. Callers that omit p_include_examples keep
-- working unchanged via the DEFAULT FALSE.

-- ============================================
-- 1. scan_jobs にオプション列を足す
-- ============================================
--
-- バックグラウンドスキャンのワーカーはジョブ行しか見ないので、選択結果を
-- ジョブ側に固定する。列が無い（未適用の）DBではワーカー側が undefined を
-- 読んで OFF に倒れるので、適用前でも「既定OFF」として正しく動く。

ALTER TABLE public.scan_jobs
  ADD COLUMN IF NOT EXISTS include_examples BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================
-- 2. scan_coin_cost / consume_scan_coins with the example surcharge
-- ============================================

DROP FUNCTION IF EXISTS public.consume_scan_coins(TEXT[], INTEGER, UUID, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.scan_coin_cost(TEXT[], INTEGER, BOOLEAN, BOOLEAN);

CREATE FUNCTION public.scan_coin_cost(
  p_modes TEXT[],
  p_image_count INTEGER,
  p_include_morphology BOOLEAN DEFAULT FALSE,
  p_include_derived_words BOOLEAN DEFAULT FALSE,
  p_include_examples BOOLEAN DEFAULT FALSE
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
      WHEN 'custom'  THEN 3
      ELSE NULL
    END;
    IF v_mode_cost IS NULL THEN
      RAISE EXCEPTION 'unknown scan mode: %', v_mode;
    END IF;
    v_cost := v_cost + v_mode_cost;
  END LOOP;

  -- p_include_derived_words は受け取るだけで加算しない（機能削除済み）。
  RETURN v_cost + (p_image_count - 1)
    + (CASE WHEN COALESCE(p_include_morphology, FALSE) THEN 2 ELSE 0 END)
    + (CASE WHEN COALESCE(p_include_examples, FALSE) THEN 2 ELSE 0 END);
END;
$$;

CREATE FUNCTION public.consume_scan_coins(
  p_modes TEXT[],
  p_image_count INTEGER,
  p_scan_job_id UUID DEFAULT NULL,
  p_include_morphology BOOLEAN DEFAULT FALSE,
  p_include_derived_words BOOLEAN DEFAULT FALSE,
  p_include_examples BOOLEAN DEFAULT FALSE
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

  v_cost := public.scan_coin_cost(
    p_modes, p_image_count, p_include_morphology, p_include_derived_words, p_include_examples
  );

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
       'include_examples', COALESCE(p_include_examples, FALSE),
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

REVOKE ALL ON FUNCTION public.consume_scan_coins(TEXT[], INTEGER, UUID, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_scan_coins(TEXT[], INTEGER, UUID, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- ============================================
-- 3. 古典語の例文キャッシュ（英語側の lexicon_entries と同じ扱い）
-- ============================================
--
-- 例文は見出し語ごとに1つあれば学習には足りるので、語義単位ではなくエントリに持つ。
-- 全ユーザー共通の辞書なので、いちど生成すれば以後は誰のスキャンでも再利用できる。
-- 書き込みは service role 経由のみ（20260909120000 で張ったRLSポリシーのまま）。

ALTER TABLE public.classical_entries
  ADD COLUMN IF NOT EXISTS example_sentence text NULL,
  ADD COLUMN IF NOT EXISTS example_sentence_ja text NULL;

NOTIFY pgrst, 'reload schema';
