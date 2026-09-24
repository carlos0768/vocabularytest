-- 無料ユーザー向けの1日2回のリアルタイム対戦枠。
--
-- 対戦はこれまでPro限定だったが、Freeでも「1日2回まで」対戦できるようにする。
-- Proは今までどおり無制限・コイン消費なし。
--
-- 設計:
--   * 1回 = 実際に始まった対戦1部屋。ロビーで待っただけ・マッチング前に
--     抜けただけでは消費しない。消費は `startBattle` が部屋を掴んだ後に
--     参加者ぶん記録する（ボット戦は人間ひとりぶん）。
--   * 記録は (user_id, room_id) 主キーなので、同じ部屋で何度呼ばれても
--     二重に減らない。再戦は別の部屋なので別の1回として数える。
--   * 1日の境界は JST（Asia/Tokyo）の暦日。コインの月境界（coin_month_key）
--     と同じ理由で、UTCだと日本のユーザーには9時間ずれた時刻にリセットされる。
--   * room_id は ON DELETE CASCADE。対戦の部屋は cancelled / finished に
--     するだけで消していないので実際には落ちないが、将来まとめて消す処理を
--     足すなら「当日ぶんの枠が戻る」ことになる点に注意。
--   * FREE_DAILY_BATTLE_LIMIT = 2 は src/lib/battle/free-allowance.ts にも
--     書かれていて、contract test がこのファイルの数値と突き合わせている。
--     変えるときは両方いっしょに。

-- ============================================
-- 1. Day key helper (single source of truth)
-- ============================================

CREATE OR REPLACE FUNCTION public.battle_day_key(p_at TIMESTAMPTZ DEFAULT now())
RETURNS TEXT
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT to_char(p_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD');
$$;

-- ============================================
-- 2. Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.battle_free_entries (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id    UUID NOT NULL REFERENCES public.battle_rooms(id) ON DELETE CASCADE,
  day_key    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS battle_free_entries_user_day_idx
  ON public.battle_free_entries (user_id, day_key);

-- ============================================
-- 3. RLS: SELECT-own only; writes exclusively via service role / RPCs
-- ============================================

ALTER TABLE public.battle_free_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'battle_free_entries'
      AND policyname = 'Users can view own battle entries'
  ) THEN
    CREATE POLICY "Users can view own battle entries"
      ON public.battle_free_entries FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'battle_free_entries'
      AND policyname = 'Service role can manage battle entries'
  ) THEN
    CREATE POLICY "Service role can manage battle entries"
      ON public.battle_free_entries FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- 4. Allowance lookup (read-only)
-- ============================================
-- LIMIT — mirrored in src/lib/battle/free-allowance.ts; a contract test reads
-- this migration file and asserts the literal matches. Change both together.
--   free daily battle limit = 2

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
  v_limit   INTEGER := 2;
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
-- 5. Consume one entry (idempotent per room)
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
  v_limit     INTEGER := 2;
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
  -- これが無いと2つの部屋が同時に「残り1」を見て両方通ってしまう。
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

COMMENT ON TABLE public.battle_free_entries IS
  '無料ユーザーが実際に開始した対戦の記録。(user_id, room_id) 主キーで同じ部屋の二重計上を防ぎ、day_key（JST暦日）ごとの件数が1日の消費回数になる。';
