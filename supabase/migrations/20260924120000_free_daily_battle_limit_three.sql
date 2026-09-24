-- 無料ユーザーの1日の対戦枠を 2 回から 3 回へ。
--
-- 枠の数え方そのもの（battle_free_entries、JSTの暦日、部屋ごとの冪等性）は
-- 20260916130000_free_daily_battle_allowance.sql のまま。ここで差し替えるのは
-- 2つの RPC が持つ上限値だけ。適用ずみのマイグレーションは書き換えられないので
-- CREATE OR REPLACE で上書きする。
--
-- FREE_DAILY_BATTLE_LIMIT = 3 は src/lib/battle/free-allowance.ts にも書かれて
-- いて、contract test が「v_limit を持ついちばん新しいマイグレーション」と
-- 突き合わせている。変えるときは両方いっしょに。

-- ============================================
-- 1. Allowance lookup (read-only)
-- ============================================
-- LIMIT — mirrored in src/lib/battle/free-allowance.ts.
--   free daily battle limit = 3

CREATE OR REPLACE FUNCTION public.get_free_battle_allowance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_pro  BOOLEAN;
  v_day     TEXT := public.battle_day_key();
  v_limit   INTEGER := 3;
  v_used    INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id must not be null';
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
  WHERE user_id = p_user_id
  LIMIT 1;

  v_is_pro := COALESCE(v_is_pro, FALSE);

  IF v_is_pro THEN
    -- Pro は無制限。残数の概念を持たせない（UIも出さない）。
    RETURN jsonb_build_object(
      'is_pro', true,
      'day_key', v_day,
      'limit', NULL,
      'used', NULL,
      'remaining', NULL
    );
  END IF;

  SELECT COUNT(*) INTO v_used
  FROM public.battle_free_entries
  WHERE user_id = p_user_id AND day_key = v_day;

  RETURN jsonb_build_object(
    'is_pro', false,
    'day_key', v_day,
    'limit', v_limit,
    'used', v_used,
    'remaining', GREATEST(0, v_limit - v_used)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_free_battle_allowance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_free_battle_allowance(UUID) TO service_role;

-- ============================================
-- 2. Consume one entry (idempotent per room)
-- ============================================

CREATE OR REPLACE FUNCTION public.consume_free_battle_entry(
  p_user_id UUID,
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_pro    BOOLEAN;
  v_day       TEXT := public.battle_day_key();
  v_limit     INTEGER := 3;
  v_used      INTEGER := 0;
  v_recorded  BOOLEAN;
BEGIN
  IF p_user_id IS NULL OR p_room_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id and p_room_id must not be null';
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
  WHERE user_id = p_user_id
  LIMIT 1;

  v_is_pro := COALESCE(v_is_pro, FALSE);

  IF v_is_pro THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'is_pro', true,
      'day_key', v_day,
      'limit', NULL,
      'used', NULL,
      'remaining', NULL
    );
  END IF;

  -- 同じユーザーの同時実行（両クライアントが start を叩く等）を直列化する。
  -- これが無いと2つの部屋が同時に同じ残数を見て両方通ってしまう。
  PERFORM pg_advisory_xact_lock(hashtextextended('battle_free_entry:' || p_user_id::text, 0));

  SELECT TRUE INTO v_recorded
  FROM public.battle_free_entries
  WHERE user_id = p_user_id AND room_id = p_room_id;

  SELECT COUNT(*) INTO v_used
  FROM public.battle_free_entries
  WHERE user_id = p_user_id AND day_key = v_day;

  -- すでにこの部屋で数えてある（再送・両クライアントからの start）。
  IF COALESCE(v_recorded, FALSE) THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'is_pro', false,
      'already_counted', true,
      'day_key', v_day,
      'limit', v_limit,
      'used', v_used,
      'remaining', GREATEST(0, v_limit - v_used)
    );
  END IF;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'is_pro', false,
      'already_counted', false,
      'day_key', v_day,
      'limit', v_limit,
      'used', v_used,
      'remaining', 0
    );
  END IF;

  INSERT INTO public.battle_free_entries (user_id, room_id, day_key)
  VALUES (p_user_id, p_room_id, v_day);

  v_used := v_used + 1;

  RETURN jsonb_build_object(
    'allowed', true,
    'is_pro', false,
    'already_counted', false,
    'day_key', v_day,
    'limit', v_limit,
    'used', v_used,
    'remaining', GREATEST(0, v_limit - v_used)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_free_battle_entry(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_free_battle_entry(UUID, UUID) TO service_role;
