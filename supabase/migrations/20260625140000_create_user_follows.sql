-- One-way follow system (Twitter-style).
-- Public accounts: follow instantly. Private accounts: follow requires approval.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  responded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT user_follows_distinct_users CHECK (follower_id <> following_id),
  CONSTRAINT user_follows_status_check CHECK (status IN ('active', 'pending'))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_follows_pair_key
  ON public.user_follows (follower_id, following_id);

CREATE INDEX IF NOT EXISTS user_follows_follower_idx
  ON public.user_follows (follower_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS user_follows_following_idx
  ON public.user_follows (following_id, status, created_at DESC);

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select_participants" ON public.user_follows;
CREATE POLICY "follows_select_participants"
  ON public.user_follows
  FOR SELECT
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "follows_insert_own" ON public.user_follows;
CREATE POLICY "follows_insert_own"
  ON public.user_follows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = follower_id
    AND follower_id <> following_id
  );

DROP POLICY IF EXISTS "follows_update_participants" ON public.user_follows;
CREATE POLICY "follows_update_participants"
  ON public.user_follows
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id)
  WITH CHECK (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "follows_delete_participants" ON public.user_follows;
CREATE POLICY "follows_delete_participants"
  ON public.user_follows
  FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Update quiz_sessions RLS to also allow followers (active status) to see sessions.
DROP POLICY IF EXISTS "quiz_sessions_select_self_or_friend" ON public.quiz_sessions;
CREATE POLICY "quiz_sessions_select_visible"
  ON public.quiz_sessions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.user_friendships uf
      WHERE uf.status = 'accepted'
        AND (
          (uf.requester_id = auth.uid() AND uf.addressee_id = quiz_sessions.user_id)
          OR (uf.addressee_id = auth.uid() AND uf.requester_id = quiz_sessions.user_id)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_follows f
      WHERE f.status = 'active'
        AND f.follower_id = auth.uid()
        AND f.following_id = quiz_sessions.user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.study_group_members sgm1
      JOIN public.study_group_members sgm2
        ON sgm1.group_id = sgm2.group_id
      WHERE sgm1.user_id = auth.uid()
        AND sgm2.user_id = quiz_sessions.user_id
    )
  );

-- Update quiz_session_words RLS similarly.
DROP POLICY IF EXISTS "quiz_session_words_select_self_or_friend" ON public.quiz_session_words;
CREATE POLICY "quiz_session_words_select_visible"
  ON public.quiz_session_words
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.user_friendships uf
      WHERE uf.status = 'accepted'
        AND (
          (uf.requester_id = auth.uid() AND uf.addressee_id = quiz_session_words.user_id)
          OR (uf.addressee_id = auth.uid() AND uf.requester_id = quiz_session_words.user_id)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_follows f
      WHERE f.status = 'active'
        AND f.follower_id = auth.uid()
        AND f.following_id = quiz_session_words.user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.study_group_members sgm1
      JOIN public.study_group_members sgm2
        ON sgm1.group_id = sgm2.group_id
      WHERE sgm1.user_id = auth.uid()
        AND sgm2.user_id = quiz_session_words.user_id
    )
  );

DROP TRIGGER IF EXISTS update_user_follows_updated_at
  ON public.user_follows;
CREATE TRIGGER update_user_follows_updated_at
  BEFORE UPDATE ON public.user_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
