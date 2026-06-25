-- Friends, searchable account IDs, and friend-visible quiz sessions.

CREATE OR REPLACE FUNCTION public.generate_profile_account_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    candidate := 'mk' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE account_id = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_id TEXT;

UPDATE public.profiles
SET account_id = public.generate_profile_account_id()
WHERE account_id IS NULL OR trim(account_id) = '';

ALTER TABLE public.profiles
  ALTER COLUMN account_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_account_id_format'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_id_format
      CHECK (
        account_id = lower(account_id)
        AND account_id ~ '^[a-z0-9_]{4,24}$'
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_id_key
  ON public.profiles (account_id);

CREATE INDEX IF NOT EXISTS profiles_username_search_idx
  ON public.profiles (lower(username));

CREATE TABLE IF NOT EXISTS public.user_friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  responded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT user_friendships_distinct_users CHECK (requester_id <> addressee_id),
  CONSTRAINT user_friendships_status_check CHECK (status IN ('pending', 'accepted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_friendships_pair_key
  ON public.user_friendships (
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id)
  );

CREATE INDEX IF NOT EXISTS user_friendships_requester_idx
  ON public.user_friendships (requester_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS user_friendships_addressee_idx
  ON public.user_friendships (addressee_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NOT NULL,
  last_answered_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  answer_count INTEGER NOT NULL DEFAULT 0,
  mastered_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT quiz_sessions_counts_nonnegative CHECK (answer_count >= 0 AND mastered_count >= 0),
  CONSTRAINT quiz_sessions_expires_after_start CHECK (expires_at > started_at)
);

CREATE INDEX IF NOT EXISTS quiz_sessions_user_started_idx
  ON public.quiz_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS quiz_sessions_started_idx
  ON public.quiz_sessions (started_at DESC);

CREATE TABLE IF NOT EXISTS public.quiz_session_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL,
  project_id TEXT,
  english TEXT NOT NULL,
  japanese TEXT NOT NULL,
  mastered_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT quiz_session_words_word_id_length CHECK (char_length(trim(word_id)) BETWEEN 1 AND 120),
  CONSTRAINT quiz_session_words_english_length CHECK (char_length(trim(english)) BETWEEN 1 AND 200),
  CONSTRAINT quiz_session_words_japanese_length CHECK (char_length(trim(japanese)) BETWEEN 1 AND 300),
  CONSTRAINT quiz_session_words_session_word_key UNIQUE (session_id, word_id)
);

CREATE INDEX IF NOT EXISTS quiz_session_words_session_idx
  ON public.quiz_session_words (session_id, mastered_at ASC);

CREATE INDEX IF NOT EXISTS quiz_session_words_user_idx
  ON public.quiz_session_words (user_id, mastered_at DESC);

ALTER TABLE public.user_friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_session_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_select_participants" ON public.user_friendships;
CREATE POLICY "friendships_select_participants"
  ON public.user_friendships
  FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "friendships_insert_own_pending" ON public.user_friendships;
CREATE POLICY "friendships_insert_own_pending"
  ON public.user_friendships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_id <> addressee_id
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "friendships_update_participants" ON public.user_friendships;
CREATE POLICY "friendships_update_participants"
  ON public.user_friendships
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "friendships_delete_participants" ON public.user_friendships;
CREATE POLICY "friendships_delete_participants"
  ON public.user_friendships
  FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "quiz_sessions_select_self_or_friend" ON public.quiz_sessions;
CREATE POLICY "quiz_sessions_select_self_or_friend"
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
  );

DROP POLICY IF EXISTS "quiz_sessions_insert_own" ON public.quiz_sessions;
CREATE POLICY "quiz_sessions_insert_own"
  ON public.quiz_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "quiz_sessions_update_own" ON public.quiz_sessions;
CREATE POLICY "quiz_sessions_update_own"
  ON public.quiz_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "quiz_session_words_select_self_or_friend" ON public.quiz_session_words;
CREATE POLICY "quiz_session_words_select_self_or_friend"
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
  );

DROP POLICY IF EXISTS "quiz_session_words_insert_own" ON public.quiz_session_words;
CREATE POLICY "quiz_session_words_insert_own"
  ON public.quiz_session_words
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "quiz_session_words_update_own" ON public.quiz_session_words;
CREATE POLICY "quiz_session_words_update_own"
  ON public.quiz_session_words
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_friendships_updated_at
  ON public.user_friendships;
CREATE TRIGGER update_user_friendships_updated_at
  BEFORE UPDATE ON public.user_friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_quiz_sessions_updated_at
  ON public.quiz_sessions;
CREATE TRIGGER update_quiz_sessions_updated_at
  BEFORE UPDATE ON public.quiz_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, status, plan)
  VALUES (NEW.id, 'free', 'free');

  INSERT INTO public.profiles (user_id, onboarding_step, account_id)
  VALUES (NEW.id, 'signed_up', public.generate_profile_account_id())
  ON CONFLICT (user_id) DO UPDATE
    SET
      onboarding_step = COALESCE(public.profiles.onboarding_step, EXCLUDED.onboarding_step),
      account_id = COALESCE(public.profiles.account_id, EXCLUDED.account_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
