-- ============================================
-- Group matchmaking for リアルタイム単語対戦
--
-- Adds a group-scoped variant of random matchmaking: players queue from a
-- study group's page and are only ever paired with someone queued for the same
-- group. The global queue (group_id IS NULL) keeps working exactly as before.
-- ============================================

ALTER TABLE public.battle_queue
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.study_groups(id) ON DELETE CASCADE;

-- Pairing scans the queue by (group, age); the global queue keeps using
-- battle_queue_created_idx.
CREATE INDEX IF NOT EXISTS battle_queue_group_created_idx
  ON public.battle_queue (group_id, created_at ASC)
  WHERE group_id IS NOT NULL;

ALTER TABLE public.battle_rooms
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.study_groups(id) ON DELETE SET NULL;

-- 'group' joins the existing modes. Rooms created before this migration keep
-- their 'friend' / 'random' mode.
ALTER TABLE public.battle_rooms
  DROP CONSTRAINT IF EXISTS battle_rooms_mode_check;
ALTER TABLE public.battle_rooms
  ADD CONSTRAINT battle_rooms_mode_check CHECK (mode IN ('friend', 'random', 'group'));

CREATE INDEX IF NOT EXISTS battle_rooms_group_idx
  ON public.battle_rooms (group_id, created_at DESC)
  WHERE group_id IS NOT NULL;

-- Pairs two members of the same study group. Mirrors pair_battle_match
-- (20260814100000_create_word_battles.sql) with two differences: membership is
-- verified for both sides, and the queue lookup is scoped to the group so a
-- group player never gets pulled into the global pool (or vice versa).
CREATE OR REPLACE FUNCTION public.pair_group_battle_match(
  p_user_id UUID,
  p_group_id UUID,
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.study_group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'not_a_group_member' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.battle_queue
  WHERE created_at < timezone('utc', now()) - p_stale_after;

  -- Lock the oldest waiting member of this group so two simultaneous callers
  -- cannot both claim the same person.
  SELECT q.* INTO v_opponent
  FROM public.battle_queue q
  WHERE q.user_id <> p_user_id
    AND q.group_id = p_group_id
    AND EXISTS (
      SELECT 1
      FROM public.study_group_members m
      WHERE m.group_id = p_group_id
        AND m.user_id = q.user_id
    )
  ORDER BY q.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.battle_queue (user_id, project_id, question_count, round_duration_ms, group_id)
    VALUES (p_user_id, p_project_id, p_question_count, p_round_duration_ms, p_group_id)
    ON CONFLICT (user_id) DO UPDATE
      SET
        project_id = EXCLUDED.project_id,
        question_count = EXCLUDED.question_count,
        round_duration_ms = EXCLUDED.round_duration_ms,
        group_id = EXCLUDED.group_id,
        created_at = timezone('utc', now());

    RETURN NULL;
  END IF;

  DELETE FROM public.battle_queue WHERE user_id IN (v_opponent.user_id, p_user_id);

  -- The player who was already waiting becomes the host, so their client can
  -- watch for an INSERT on battle_rooms filtered by host_user_id. The host's
  -- wordbook is also the one questions are generated from.
  INSERT INTO public.battle_rooms (
    mode, status, host_user_id, host_project_id, guest_user_id, guest_project_id,
    question_count, round_duration_ms, group_id
  )
  VALUES (
    'group', 'ready', v_opponent.user_id, v_opponent.project_id, p_user_id, p_project_id,
    v_opponent.question_count, v_opponent.round_duration_ms, p_group_id
  )
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;

REVOKE ALL ON FUNCTION public.pair_group_battle_match(UUID, UUID, UUID, INTEGER, INTEGER, INTERVAL) FROM PUBLIC, authenticated, anon;

-- The global queue must ignore group entries now that both share one table:
-- without this, someone waiting for a group match could be pulled into a
-- random match with a stranger. Same body as the original in
-- 20260814100000_create_word_battles.sql plus the group_id guards.
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
  -- claim the same person. Group entries are not eligible here.
  SELECT * INTO v_opponent
  FROM public.battle_queue
  WHERE user_id <> p_user_id
    AND group_id IS NULL
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.battle_queue (user_id, project_id, question_count, round_duration_ms, group_id)
    VALUES (p_user_id, p_project_id, p_question_count, p_round_duration_ms, NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET
        project_id = EXCLUDED.project_id,
        question_count = EXCLUDED.question_count,
        round_duration_ms = EXCLUDED.round_duration_ms,
        -- Re-queueing globally clears a previous group entry.
        group_id = NULL,
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
