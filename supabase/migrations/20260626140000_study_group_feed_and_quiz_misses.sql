-- Study-group activity feed events + quiz word-miss logging.
-- Powers the redesigned group page (leaderboard / most-missed words) and the
-- feed entries written when a wordbook is shared into a group.

-- ============================================================================
-- study_group_feed_events: timeline entries scoped to a study group.
-- Currently only `project_added`, but `event_type` keeps room for more.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.study_group_feed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'project_added',
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  group_name TEXT NOT NULL,
  project_title TEXT NOT NULL,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT study_group_feed_events_type_check
    CHECK (event_type IN ('project_added')),
  CONSTRAINT study_group_feed_events_group_name_length
    CHECK (char_length(trim(group_name)) BETWEEN 1 AND 80),
  CONSTRAINT study_group_feed_events_project_title_length
    CHECK (char_length(trim(project_title)) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS study_group_feed_events_group_idx
  ON public.study_group_feed_events (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS study_group_feed_events_created_idx
  ON public.study_group_feed_events (created_at DESC);

ALTER TABLE public.study_group_feed_events ENABLE ROW LEVEL SECURITY;

-- Group members can read their groups' feed. Writes happen server-side with the
-- service role, so there is intentionally no INSERT policy for `authenticated`.
DROP POLICY IF EXISTS "study_group_feed_events_select_members"
  ON public.study_group_feed_events;
CREATE POLICY "study_group_feed_events_select_members"
  ON public.study_group_feed_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.study_group_members sgm
      WHERE sgm.group_id = study_group_feed_events.group_id
        AND sgm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- quiz_word_misses: one row per wrong quiz answer. Aggregated per group member
-- set to surface the words a group struggles with most.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.quiz_word_misses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id TEXT,
  project_id TEXT,
  english_key TEXT NOT NULL,
  english TEXT NOT NULL,
  japanese TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT quiz_word_misses_english_key_length
    CHECK (char_length(trim(english_key)) BETWEEN 1 AND 200),
  CONSTRAINT quiz_word_misses_english_length
    CHECK (char_length(trim(english)) BETWEEN 1 AND 200),
  CONSTRAINT quiz_word_misses_japanese_length
    CHECK (char_length(trim(japanese)) BETWEEN 1 AND 300)
);

CREATE INDEX IF NOT EXISTS quiz_word_misses_user_created_idx
  ON public.quiz_word_misses (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quiz_word_misses_user_key_idx
  ON public.quiz_word_misses (user_id, english_key);

ALTER TABLE public.quiz_word_misses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_word_misses_select_own" ON public.quiz_word_misses;
CREATE POLICY "quiz_word_misses_select_own"
  ON public.quiz_word_misses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "quiz_word_misses_insert_own" ON public.quiz_word_misses;
CREATE POLICY "quiz_word_misses_insert_own"
  ON public.quiz_word_misses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Ask PostgREST to reload its schema cache so the new tables are visible.
NOTIFY pgrst, 'reload schema';
