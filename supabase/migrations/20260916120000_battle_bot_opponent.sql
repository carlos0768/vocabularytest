-- ============================================
-- 人が集まらないときのボット対戦 (bot opponent)
--
-- ランダムマッチ／グループ内マッチで相手が見つからないとき、ゲスト席にボットを
-- 座らせて対戦を成立させる。
--
-- 設計方針は人間同士の対戦と同じで「判定はすべてサーバー権威」:
--   * ボットが「いつ・どれを押すか」は問題生成と同時に決めて
--     `battle_bot_plans` に隠す。battle_question_keys と同じく RLS を有効に
--     したうえでポリシーを一切張らないので、クライアントからは読めない。
--     ここにSELECTポリシーを足すと「ボットが何秒後に正解するか」が事前に
--     分かってしまうので絶対に追加しない。
--   * 実際にボットが押すのは SECURITY DEFINER の
--     `apply_battle_bot_turn` だけ。人間の回答・時間切れ・クライアントからの
--     tick のいずれの経路でも、押す時刻は出題開始時刻＋計画値をサーバーが
--     その場で再計算して判定する。クライアントが tick を止めてもボットの
--     回答を飛ばせない（人間が回答した時点で、先にボットの番が清算される）。
--
-- Route Handler は常駐できないので「サーバー側タイマー」は持てない。代わりに
-- 人間のクライアントが短い間隔で settle_battle_bot_turn を叩き、サーバーが
-- 時刻を検証する（ラウンド進行・時間切れとまったく同じ方式）。
-- ============================================

-- ============================================
-- Rooms: ゲスト席のボット
-- ============================================

ALTER TABLE public.battle_rooms
  ADD COLUMN IF NOT EXISTS guest_is_bot BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.battle_rooms
  ADD COLUMN IF NOT EXISTS bot_level TEXT;
ALTER TABLE public.battle_rooms
  ADD COLUMN IF NOT EXISTS bot_name TEXT;

ALTER TABLE public.battle_rooms
  DROP CONSTRAINT IF EXISTS battle_rooms_bot_level_check;
ALTER TABLE public.battle_rooms
  ADD CONSTRAINT battle_rooms_bot_level_check CHECK (
    bot_level IS NULL OR bot_level IN ('easy', 'normal', 'hard')
  );

-- ボット戦にはゲストの人間が入らない。席が埋まっているのにマッチングで
-- 上書きされる、という事故を型で塞いでおく。
ALTER TABLE public.battle_rooms
  DROP CONSTRAINT IF EXISTS battle_rooms_bot_seat_check;
ALTER TABLE public.battle_rooms
  ADD CONSTRAINT battle_rooms_bot_seat_check CHECK (
    NOT guest_is_bot OR (guest_user_id IS NULL AND bot_level IS NOT NULL)
  );

-- 決着表示のために「ボットが先に正解した」を人間側へ伝える必要がある。
-- answered_by はボットのとき NULL（＝時間切れ）になってしまうため別の印を持つ。
ALTER TABLE public.battle_questions
  ADD COLUMN IF NOT EXISTS answered_by_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================
-- Answers: ボットの回答も同じ台帳に残す
-- ============================================

ALTER TABLE public.battle_answers
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.battle_answers
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.battle_answers
  DROP CONSTRAINT IF EXISTS battle_answers_actor_check;
ALTER TABLE public.battle_answers
  ADD CONSTRAINT battle_answers_actor_check CHECK (user_id IS NOT NULL OR is_bot);

-- user_id が NULL だと battle_answers_one_attempt_key が効かない（NULL 同士は
-- 重複扱いされない）ので、ボットぶんは部分ユニーク索引で1ラウンド1回に縛る。
CREATE UNIQUE INDEX IF NOT EXISTS battle_answers_bot_attempt_key
  ON public.battle_answers (room_id, round_index)
  WHERE is_bot;

-- ============================================
-- Bot plans (クライアントからは絶対に読めない)
-- ============================================

CREATE TABLE IF NOT EXISTS public.battle_bot_plans (
  room_id UUID NOT NULL REFERENCES public.battle_rooms(id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL,
  -- 出題開始から何ms後に押すか。
  buzz_at_ms INTEGER NOT NULL,
  -- そのとき押す選択肢。正解とは限らない（強さで正答率が変わる）。
  choice_index INTEGER NOT NULL,
  -- false なら、このラウンドは最後まで押さない（見送り）。
  will_answer BOOLEAN NOT NULL DEFAULT TRUE,
  applied_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, round_index),
  CONSTRAINT battle_bot_plans_choice_range CHECK (choice_index BETWEEN 0 AND 3),
  CONSTRAINT battle_bot_plans_buzz_nonnegative CHECK (buzz_at_ms >= 0)
);

ALTER TABLE public.battle_bot_plans ENABLE ROW LEVEL SECURITY;

-- battle_question_keys と同じ扱い: RLS を有効にしてポリシーを張らないので
-- authenticated からは読めない。SECURITY DEFINER の RPC だけが参照する。
REVOKE ALL ON public.battle_bot_plans FROM authenticated, anon;

-- ============================================
-- 開示（ボットが取ったラウンドを区別できるようにする）
-- ============================================

DROP FUNCTION IF EXISTS public.reveal_battle_round(UUID, INTEGER, UUID);

CREATE OR REPLACE FUNCTION public.reveal_battle_round(
  p_room_id UUID,
  p_round_index INTEGER,
  p_answered_by UUID,
  p_answered_by_bot BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key public.battle_question_keys;
BEGIN
  SELECT * INTO v_key
  FROM public.battle_question_keys
  WHERE room_id = p_room_id AND round_index = p_round_index;

  UPDATE public.battle_questions
  SET
    resolved_at = timezone('utc', now()),
    answered_by = p_answered_by,
    answered_by_bot = COALESCE(p_answered_by_bot, FALSE),
    revealed_correct_index = v_key.correct_index,
    revealed_answer = v_key.answer
  WHERE room_id = p_room_id
    AND round_index = p_round_index
    AND resolved_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_battle_round(UUID, INTEGER, UUID, BOOLEAN) FROM PUBLIC, authenticated, anon;

-- ============================================
-- ボットの手番
-- ============================================

-- 計画された時刻に達していればボットの回答を1回だけ記録する。呼び出し側が
-- 部屋行をロックしている前提（人間の回答・時間切れ・tick のいずれも
-- `FOR UPDATE` 済みで入ってくる）なので、ここでは時刻の判定だけを行う。
-- 戻り値はボットが動いたかどうか。
CREATE OR REPLACE FUNCTION public.apply_battle_bot_turn(
  p_room_id UUID,
  p_round_index INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.battle_rooms;
  v_question public.battle_questions;
  v_plan public.battle_bot_plans;
  v_key public.battle_question_keys;
  v_is_correct BOOLEAN;
  v_human_answered BOOLEAN;
BEGIN
  SELECT * INTO v_room FROM public.battle_rooms WHERE id = p_room_id;

  IF NOT FOUND OR NOT v_room.guest_is_bot OR v_room.status <> 'in_progress' THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_plan
  FROM public.battle_bot_plans
  WHERE room_id = p_room_id AND round_index = p_round_index;

  IF NOT FOUND OR NOT v_plan.will_answer OR v_plan.applied_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_question
  FROM public.battle_questions
  WHERE room_id = p_room_id AND round_index = p_round_index;

  IF NOT FOUND OR v_question.started_at IS NULL OR v_question.resolved_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  -- 押すと決めた時刻まではまだ動かない。tick が遅れて届いた場合は「予定どおり
  -- その時刻に押した」ものとして扱う（締切を過ぎていても、人間が黙っていた
  -- ラウンドはボットのもの）。
  IF timezone('utc', now())
    < v_question.started_at + make_interval(secs => v_plan.buzz_at_ms / 1000.0)
  THEN
    RETURN FALSE;
  END IF;

  UPDATE public.battle_bot_plans
  SET applied_at = timezone('utc', now())
  WHERE room_id = p_room_id AND round_index = p_round_index AND applied_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_key
  FROM public.battle_question_keys
  WHERE room_id = p_room_id AND round_index = p_round_index;

  v_is_correct := (v_plan.choice_index = v_key.correct_index);

  INSERT INTO public.battle_answers (
    room_id, round_index, user_id, is_bot, choice_index, is_correct, elapsed_ms
  )
  VALUES (
    p_room_id, p_round_index, NULL, TRUE, v_plan.choice_index, v_is_correct, v_plan.buzz_at_ms
  );

  IF v_is_correct THEN
    UPDATE public.battle_rooms SET guest_score = guest_score + 1 WHERE id = p_room_id;
    PERFORM public.reveal_battle_round(p_room_id, p_round_index, NULL, TRUE);
    RETURN TRUE;
  END IF;

  -- 外した: ボットはこのラウンドで失権。人間も回答済みなら誰も取れないので
  -- ここでラウンドを終わらせる（人間同士のときとまったく同じ扱い）。
  SELECT EXISTS (
    SELECT 1 FROM public.battle_answers
    WHERE room_id = p_room_id
      AND round_index = p_round_index
      AND user_id = v_room.host_user_id
  ) INTO v_human_answered;

  IF v_human_answered THEN
    PERFORM public.reveal_battle_round(p_room_id, p_round_index, NULL, FALSE);
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_battle_bot_turn(UUID, INTEGER) FROM PUBLIC, authenticated, anon;

-- 人間のクライアントが短い間隔で叩く「ボットの番の清算」。押す時刻の判定は
-- すべて apply_battle_bot_turn（＝サーバー時刻）が行うので、呼ぶ側が早めに
-- 叩いてもボットは早く押さない。
CREATE OR REPLACE FUNCTION public.settle_battle_bot_turn(
  p_room_id UUID,
  p_round_index INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room public.battle_rooms;
  v_acted BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_room FROM public.battle_rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user <> v_room.host_user_id AND v_user IS DISTINCT FROM v_room.guest_user_id THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;

  IF NOT v_room.guest_is_bot THEN
    RETURN jsonb_build_object('acted', false);
  END IF;

  v_acted := public.apply_battle_bot_turn(p_room_id, p_round_index);

  RETURN jsonb_build_object('acted', v_acted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_battle_bot_turn(UUID, INTEGER) TO authenticated;

-- ============================================
-- 既存RPCの差し替え（ボット戦ぶんの分岐だけを足す）
-- ============================================

-- 20260814100000_create_word_battles.sql の submit_battle_answer に
--   1. 判定前にボットの番を清算する（tick が届いていなくても順序を守る）
--   2. 相手（＝ボット）が回答済みかどうかの判定
-- を足したもの。それ以外は同じ。
CREATE OR REPLACE FUNCTION public.submit_battle_answer(
  p_room_id UUID,
  p_round_index INTEGER,
  p_choice_index INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room public.battle_rooms;
  v_question public.battle_questions;
  v_key public.battle_question_keys;
  v_is_correct BOOLEAN;
  v_opponent UUID;
  v_opponent_answered BOOLEAN;
  v_elapsed_ms INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_choice_index IS NULL OR p_choice_index < 0 OR p_choice_index > 3 THEN
    RAISE EXCEPTION 'invalid_choice' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_room FROM public.battle_rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user <> v_room.host_user_id AND v_user IS DISTINCT FROM v_room.guest_user_id THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;

  IF v_room.status <> 'in_progress' THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'battle_not_in_progress');
  END IF;

  IF v_room.current_round <> p_round_index THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'stale_round');
  END IF;

  SELECT * INTO v_question
  FROM public.battle_questions
  WHERE room_id = p_room_id AND round_index = p_round_index;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_question.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'already_resolved');
  END IF;

  -- Server-side deadline. A late packet must never steal a round.
  IF v_question.started_at IS NULL
    OR timezone('utc', now()) > v_question.started_at + make_interval(secs => v_room.round_duration_ms / 1000.0)
  THEN
    PERFORM public.reveal_battle_round(p_room_id, p_round_index, NULL, FALSE);
    RETURN jsonb_build_object('accepted', false, 'reason', 'timed_out');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.battle_answers
    WHERE room_id = p_room_id AND round_index = p_round_index AND user_id = v_user
  ) THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'already_answered');
  END IF;

  -- ボット戦: 人間より先に押す予定だったなら、この場で清算する。tick が
  -- 届いていなくても「先に押した方が取る」の順序が崩れない。
  IF v_room.guest_is_bot THEN
    PERFORM public.apply_battle_bot_turn(p_room_id, p_round_index);

    SELECT * INTO v_question
    FROM public.battle_questions
    WHERE room_id = p_room_id AND round_index = p_round_index;

    IF v_question.resolved_at IS NOT NULL THEN
      RETURN jsonb_build_object('accepted', false, 'reason', 'already_resolved');
    END IF;
  END IF;

  SELECT * INTO v_key
  FROM public.battle_question_keys
  WHERE room_id = p_room_id AND round_index = p_round_index;

  v_is_correct := (p_choice_index = v_key.correct_index);
  v_elapsed_ms := GREATEST(
    0,
    (EXTRACT(EPOCH FROM (timezone('utc', now()) - v_question.started_at)) * 1000)::INTEGER
  );

  INSERT INTO public.battle_answers (room_id, round_index, user_id, choice_index, is_correct, elapsed_ms)
  VALUES (p_room_id, p_round_index, v_user, p_choice_index, v_is_correct, v_elapsed_ms);

  IF v_is_correct THEN
    IF v_user = v_room.host_user_id THEN
      UPDATE public.battle_rooms SET host_score = host_score + 1 WHERE id = p_room_id;
    ELSE
      UPDATE public.battle_rooms SET guest_score = guest_score + 1 WHERE id = p_room_id;
    END IF;

    PERFORM public.reveal_battle_round(p_room_id, p_round_index, v_user, FALSE);

    RETURN jsonb_build_object('accepted', true, 'correct', true, 'resolved', true);
  END IF;

  -- Wrong answer: this player is locked out for the round. If the opponent has
  -- already used their attempt too, nobody can score, so end the round now.
  IF v_room.guest_is_bot THEN
    -- 相手はボット。既に押したか、そもそも押さない計画なら誰も取れない。
    SELECT NOT EXISTS (
      SELECT 1 FROM public.battle_bot_plans
      WHERE room_id = p_room_id
        AND round_index = p_round_index
        AND will_answer
        AND applied_at IS NULL
    ) INTO v_opponent_answered;
  ELSE
    v_opponent := CASE WHEN v_user = v_room.host_user_id THEN v_room.guest_user_id ELSE v_room.host_user_id END;
    v_opponent_answered := v_opponent IS NULL OR EXISTS (
      SELECT 1 FROM public.battle_answers
      WHERE room_id = p_room_id AND round_index = p_round_index AND user_id = v_opponent
    );
  END IF;

  IF v_opponent_answered THEN
    PERFORM public.reveal_battle_round(p_room_id, p_round_index, NULL, FALSE);
    RETURN jsonb_build_object('accepted', true, 'correct', false, 'resolved', true);
  END IF;

  RETURN jsonb_build_object('accepted', true, 'correct', false, 'resolved', false);
END;
$$;

-- 時間切れ。ボット戦では「締切までに押す予定だったのに tick が届かなかった」
-- 分をここで清算してから時間切れにする。押す予定が無かったラウンドだけが
-- 本当の時間切れになる。
CREATE OR REPLACE FUNCTION public.resolve_battle_round_timeout(
  p_room_id UUID,
  p_round_index INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room public.battle_rooms;
  v_question public.battle_questions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_room FROM public.battle_rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user <> v_room.host_user_id AND v_user IS DISTINCT FROM v_room.guest_user_id THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_question
  FROM public.battle_questions
  WHERE room_id = p_room_id AND round_index = p_round_index;

  IF NOT FOUND OR v_question.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'already_resolved');
  END IF;

  IF v_question.started_at IS NULL
    OR timezone('utc', now()) <= v_question.started_at + make_interval(secs => v_room.round_duration_ms / 1000.0)
  THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'not_yet_expired');
  END IF;

  IF v_room.guest_is_bot THEN
    PERFORM public.apply_battle_bot_turn(p_room_id, p_round_index);

    SELECT * INTO v_question
    FROM public.battle_questions
    WHERE room_id = p_room_id AND round_index = p_round_index;

    IF v_question.resolved_at IS NOT NULL THEN
      RETURN jsonb_build_object('resolved', true);
    END IF;
  END IF;

  PERFORM public.reveal_battle_round(p_room_id, p_round_index, NULL, FALSE);

  RETURN jsonb_build_object('resolved', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_battle_answer(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_battle_round_timeout(UUID, INTEGER) TO authenticated;

COMMENT ON TABLE public.battle_bot_plans IS
  'ボット対戦で「いつ・どの選択肢を押すか」を出題時に決めておく隠し計画表。'
  'RLS 有効・ポリシー無しで、SECURITY DEFINER の RPC からしか読めない。'
  'ここを読めるようにすると、ボットが何秒後に正解するかが事前に分かってしまう。';

-- 新しい列を足したので PostgREST の schema cache を読み直させる。
-- これが無いと、適用直後に「column ... does not exist」が出続ける
-- （2026-06-24 の schema cache 障害と同じ形）。
NOTIFY pgrst, 'reload schema';
