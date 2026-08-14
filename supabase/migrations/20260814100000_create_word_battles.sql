-- リアルタイム単語対戦 (realtime word battle).
--
-- Design notes:
--   * Buzzer style (早押し): the first correct answer takes the round. Each player
--     gets exactly one attempt per round, so the lockout is the penalty for a
--     wrong guess and no negative scoring is needed.
--   * Question sets merge BOTH participants' selected wordbooks.
--   * The correct answer lives in `battle_question_keys`, which has RLS enabled and
--     deliberately NO policies. `authenticated` therefore cannot read it at all --
--     only the SECURITY DEFINER RPCs below (and the service role) can. Leaking
--     correct_index to the client would make the buzzer trivially cheatable.
--     Once a round resolves, the answer is copied into the public row so both
--     clients can display it.
--   * Judging happens inside a single locked transaction so that the "first correct
--     answer wins" ordering is decided by the database, not by client timestamps.

-- ============================================
-- Rooms
-- ============================================

CREATE TABLE IF NOT EXISTS public.battle_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  invite_code TEXT,
  host_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  host_project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  guest_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  question_count INTEGER NOT NULL DEFAULT 10,
  round_duration_ms INTEGER NOT NULL DEFAULT 15000,
  current_round INTEGER NOT NULL DEFAULT 0,
  host_score INTEGER NOT NULL DEFAULT 0,
  guest_score INTEGER NOT NULL DEFAULT 0,
  winner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT battle_rooms_mode_check CHECK (mode IN ('friend', 'random')),
  CONSTRAINT battle_rooms_status_check CHECK (
    status IN ('waiting', 'ready', 'preparing', 'in_progress', 'finished', 'cancelled')
  ),
  CONSTRAINT battle_rooms_outcome_check CHECK (
    outcome IS NULL OR outcome IN ('host', 'guest', 'draw', 'abandoned')
  ),
  CONSTRAINT battle_rooms_distinct_users CHECK (
    guest_user_id IS NULL OR guest_user_id <> host_user_id
  ),
  CONSTRAINT battle_rooms_question_count_range CHECK (question_count BETWEEN 3 AND 30),
  CONSTRAINT battle_rooms_round_duration_range CHECK (round_duration_ms BETWEEN 3000 AND 60000),
  CONSTRAINT battle_rooms_scores_nonnegative CHECK (host_score >= 0 AND guest_score >= 0)
);

-- Only one open invite per code. Finished/cancelled rooms keep their code for history.
CREATE UNIQUE INDEX IF NOT EXISTS battle_rooms_open_invite_code_key
  ON public.battle_rooms (invite_code)
  WHERE invite_code IS NOT NULL AND status IN ('waiting', 'ready', 'preparing', 'in_progress');

CREATE INDEX IF NOT EXISTS battle_rooms_host_idx
  ON public.battle_rooms (host_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS battle_rooms_guest_idx
  ON public.battle_rooms (guest_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS battle_rooms_status_idx
  ON public.battle_rooms (status, created_at DESC);

-- ============================================
-- Questions (client-visible half)
-- ============================================

CREATE TABLE IF NOT EXISTS public.battle_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.battle_rooms(id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  choices JSONB NOT NULL,
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  answered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revealed_correct_index INTEGER,
  revealed_answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT battle_questions_round_nonnegative CHECK (round_index >= 0),
  CONSTRAINT battle_questions_choices_is_array CHECK (jsonb_typeof(choices) = 'array'),
  CONSTRAINT battle_questions_room_round_key UNIQUE (room_id, round_index)
);

CREATE INDEX IF NOT EXISTS battle_questions_room_idx
  ON public.battle_questions (room_id, round_index);

-- ============================================
-- Answer keys (never readable by clients)
-- ============================================

CREATE TABLE IF NOT EXISTS public.battle_question_keys (
  room_id UUID NOT NULL REFERENCES public.battle_rooms(id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL,
  correct_index INTEGER NOT NULL,
  answer TEXT NOT NULL,
  source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (room_id, round_index),
  CONSTRAINT battle_question_keys_correct_index_range CHECK (correct_index BETWEEN 0 AND 3)
);

-- ============================================
-- Submitted answers
-- ============================================

CREATE TABLE IF NOT EXISTS public.battle_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.battle_rooms(id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  choice_index INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  elapsed_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT battle_answers_choice_range CHECK (choice_index BETWEEN 0 AND 3),
  CONSTRAINT battle_answers_one_attempt_key UNIQUE (room_id, round_index, user_id)
);

CREATE INDEX IF NOT EXISTS battle_answers_room_idx
  ON public.battle_answers (room_id, round_index);

-- ============================================
-- Random matchmaking queue
-- ============================================

CREATE TABLE IF NOT EXISTS public.battle_queue (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  question_count INTEGER NOT NULL DEFAULT 10,
  round_duration_ms INTEGER NOT NULL DEFAULT 15000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT battle_queue_question_count_range CHECK (question_count BETWEEN 3 AND 30),
  CONSTRAINT battle_queue_round_duration_range CHECK (round_duration_ms BETWEEN 3000 AND 60000)
);

CREATE INDEX IF NOT EXISTS battle_queue_created_idx
  ON public.battle_queue (created_at ASC);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE public.battle_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_queue ENABLE ROW LEVEL SECURITY;

-- Rooms: participants read only. All writes go through the RPCs / service role.
DROP POLICY IF EXISTS "battle_rooms_select_participants" ON public.battle_rooms;
CREATE POLICY "battle_rooms_select_participants"
  ON public.battle_rooms
  FOR SELECT
  TO authenticated
  USING (auth.uid() = host_user_id OR auth.uid() = guest_user_id);

-- Questions: participants read only, and only rounds that have actually started.
-- Without the started_at guard a client could prefetch every upcoming question.
DROP POLICY IF EXISTS "battle_questions_select_participants" ON public.battle_questions;
CREATE POLICY "battle_questions_select_participants"
  ON public.battle_questions
  FOR SELECT
  TO authenticated
  USING (
    started_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.battle_rooms br
      WHERE br.id = battle_questions.room_id
        AND (br.host_user_id = auth.uid() OR br.guest_user_id = auth.uid())
    )
  );

-- battle_question_keys intentionally has NO policies: RLS is on and nothing is
-- granted, so `authenticated` cannot read or write it under any circumstance.
-- Do not add a policy here -- it would hand clients the buzzer answers.

DROP POLICY IF EXISTS "battle_answers_select_participants" ON public.battle_answers;
CREATE POLICY "battle_answers_select_participants"
  ON public.battle_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.battle_rooms br
      WHERE br.id = battle_answers.room_id
        AND (br.host_user_id = auth.uid() OR br.guest_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "battle_queue_select_own" ON public.battle_queue;
CREATE POLICY "battle_queue_select_own"
  ON public.battle_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "battle_queue_delete_own" ON public.battle_queue;
CREATE POLICY "battle_queue_delete_own"
  ON public.battle_queue
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.battle_question_keys FROM authenticated, anon;

DROP TRIGGER IF EXISTS update_battle_rooms_updated_at ON public.battle_rooms;
CREATE TRIGGER update_battle_rooms_updated_at
  BEFORE UPDATE ON public.battle_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Helpers
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_battle_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    -- Base32-ish alphabet without look-alike characters (0/O, 1/I).
    candidate := (
      SELECT string_agg(
        substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1),
        ''
      )
      FROM generate_series(1, 6)
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.battle_rooms
      WHERE invite_code = candidate
        AND status IN ('waiting', 'ready', 'preparing', 'in_progress')
    );
  END LOOP;

  RETURN candidate;
END;
$$;

-- Marks a room finished and derives the winner from the scores.
CREATE OR REPLACE FUNCTION public.finalize_battle_room(p_room_id UUID)
RETURNS public.battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.battle_rooms;
BEGIN
  SELECT * INTO v_room FROM public.battle_rooms WHERE id = p_room_id FOR UPDATE;

  IF v_room.status = 'finished' THEN
    RETURN v_room;
  END IF;

  UPDATE public.battle_rooms
  SET
    status = 'finished',
    finished_at = timezone('utc', now()),
    outcome = CASE
      WHEN host_score > guest_score THEN 'host'
      WHEN guest_score > host_score THEN 'guest'
      ELSE 'draw'
    END,
    winner_user_id = CASE
      WHEN host_score > guest_score THEN host_user_id
      WHEN guest_score > host_score THEN guest_user_id
      ELSE NULL
    END
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;

-- Reveals the answer for a round and stamps it resolved.
CREATE OR REPLACE FUNCTION public.reveal_battle_round(
  p_room_id UUID,
  p_round_index INTEGER,
  p_answered_by UUID
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
    revealed_correct_index = v_key.correct_index,
    revealed_answer = v_key.answer
  WHERE room_id = p_room_id
    AND round_index = p_round_index
    AND resolved_at IS NULL;
END;
$$;

-- ============================================
-- Matchmaking (service role only -- the API route checks Pro first)
-- ============================================

-- Pairs the caller with a waiting opponent, or enqueues them. Returns the room
-- when a match was made, NULL when the caller is now waiting.
CREATE OR REPLACE FUNCTION public.pair_battle_match(
  p_user_id UUID,
  p_project_id UUID,
  p_question_count INTEGER DEFAULT 10,
  p_round_duration_ms INTEGER DEFAULT 15000,
  p_stale_after INTERVAL DEFAULT INTERVAL '2 minutes'
)
RETURNS public.battle_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opponent public.battle_queue;
  v_room public.battle_rooms;
BEGIN
  DELETE FROM public.battle_queue
  WHERE created_at < timezone('utc', now()) - p_stale_after;

  -- Lock the oldest waiting opponent so two simultaneous callers cannot both
  -- claim the same person.
  SELECT * INTO v_opponent
  FROM public.battle_queue
  WHERE user_id <> p_user_id
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.battle_queue (user_id, project_id, question_count, round_duration_ms)
    VALUES (p_user_id, p_project_id, p_question_count, p_round_duration_ms)
    ON CONFLICT (user_id) DO UPDATE
      SET
        project_id = EXCLUDED.project_id,
        question_count = EXCLUDED.question_count,
        round_duration_ms = EXCLUDED.round_duration_ms,
        created_at = timezone('utc', now());

    RETURN NULL;
  END IF;

  DELETE FROM public.battle_queue WHERE user_id IN (v_opponent.user_id, p_user_id);

  -- The player who was already waiting becomes the host, so their client can
  -- watch for an INSERT on battle_rooms filtered by host_user_id.
  INSERT INTO public.battle_rooms (
    mode, status, host_user_id, host_project_id, guest_user_id, guest_project_id,
    question_count, round_duration_ms
  )
  VALUES (
    'random', 'ready', v_opponent.user_id, v_opponent.project_id, p_user_id, p_project_id,
    v_opponent.question_count, v_opponent.round_duration_ms
  )
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;

REVOKE ALL ON FUNCTION public.pair_battle_match(UUID, UUID, INTEGER, INTEGER, INTERVAL) FROM PUBLIC, authenticated, anon;

-- ============================================
-- In-battle RPCs (latency critical -- called straight from the browser)
-- ============================================

-- Judges one buzzer attempt. The room row is locked for the duration, so the
-- database -- not the client clock -- decides who was first.
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
    PERFORM public.reveal_battle_round(p_room_id, p_round_index, NULL);
    RETURN jsonb_build_object('accepted', false, 'reason', 'timed_out');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.battle_answers
    WHERE room_id = p_room_id AND round_index = p_round_index AND user_id = v_user
  ) THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'already_answered');
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

    PERFORM public.reveal_battle_round(p_room_id, p_round_index, v_user);

    RETURN jsonb_build_object('accepted', true, 'correct', true, 'resolved', true);
  END IF;

  -- Wrong answer: this player is locked out for the round. If the opponent has
  -- already used their attempt too, nobody can score, so end the round now.
  v_opponent := CASE WHEN v_user = v_room.host_user_id THEN v_room.guest_user_id ELSE v_room.host_user_id END;
  v_opponent_answered := v_opponent IS NULL OR EXISTS (
    SELECT 1 FROM public.battle_answers
    WHERE room_id = p_room_id AND round_index = p_round_index AND user_id = v_opponent
  );

  IF v_opponent_answered THEN
    PERFORM public.reveal_battle_round(p_room_id, p_round_index, NULL);
    RETURN jsonb_build_object('accepted', true, 'correct', false, 'resolved', true);
  END IF;

  RETURN jsonb_build_object('accepted', true, 'correct', false, 'resolved', false);
END;
$$;

-- Called by whichever client's timer expires first. The deadline is re-checked
-- server-side so an early call cannot cut a round short.
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

  PERFORM public.reveal_battle_round(p_room_id, p_round_index, NULL);

  RETURN jsonb_build_object('resolved', true);
END;
$$;

-- Idempotent round advance. Both clients race to call it; only the one whose
-- `p_from_round` still matches `current_round` actually moves the battle on.
CREATE OR REPLACE FUNCTION public.advance_battle_round(
  p_room_id UUID,
  p_from_round INTEGER
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
  v_next INTEGER;
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

  IF v_room.status <> 'in_progress' OR v_room.current_round <> p_from_round THEN
    RETURN jsonb_build_object('advanced', false, 'currentRound', v_room.current_round, 'status', v_room.status);
  END IF;

  SELECT * INTO v_question
  FROM public.battle_questions
  WHERE room_id = p_room_id AND round_index = p_from_round;

  IF v_question.resolved_at IS NULL THEN
    RETURN jsonb_build_object('advanced', false, 'reason', 'round_unresolved');
  END IF;

  v_next := p_from_round + 1;

  IF v_next >= v_room.question_count THEN
    v_room := public.finalize_battle_room(p_room_id);
    RETURN jsonb_build_object('advanced', false, 'finished', true, 'status', v_room.status);
  END IF;

  UPDATE public.battle_rooms SET current_round = v_next WHERE id = p_room_id;

  UPDATE public.battle_questions
  SET started_at = timezone('utc', now())
  WHERE room_id = p_room_id AND round_index = v_next AND started_at IS NULL;

  RETURN jsonb_build_object('advanced', true, 'currentRound', v_next);
END;
$$;

-- Explicit quit / disconnect. The remaining player takes the win.
CREATE OR REPLACE FUNCTION public.abandon_battle(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_room public.battle_rooms;
  v_opponent UUID;
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

  IF v_room.status IN ('finished', 'cancelled') THEN
    RETURN jsonb_build_object('status', v_room.status);
  END IF;

  -- Nobody has joined yet: just drop the room instead of recording a forfeit.
  IF v_room.guest_user_id IS NULL THEN
    UPDATE public.battle_rooms
    SET status = 'cancelled', finished_at = timezone('utc', now())
    WHERE id = p_room_id;

    RETURN jsonb_build_object('status', 'cancelled');
  END IF;

  v_opponent := CASE WHEN v_user = v_room.host_user_id THEN v_room.guest_user_id ELSE v_room.host_user_id END;

  UPDATE public.battle_rooms
  SET
    status = 'finished',
    finished_at = timezone('utc', now()),
    outcome = 'abandoned',
    winner_user_id = v_opponent
  WHERE id = p_room_id;

  RETURN jsonb_build_object('status', 'finished', 'outcome', 'abandoned');
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_battle_answer(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_battle_round_timeout(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_battle_round(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_battle(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.reveal_battle_round(UUID, INTEGER, UUID) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.finalize_battle_room(UUID) FROM PUBLIC, authenticated, anon;

-- ============================================
-- Realtime
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'battle_rooms'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_rooms;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'battle_questions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_questions;
    END IF;
  END IF;
END;
$$;

-- Realtime needs the full old row to evaluate RLS on UPDATE payloads.
ALTER TABLE public.battle_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.battle_questions REPLICA IDENTITY FULL;
