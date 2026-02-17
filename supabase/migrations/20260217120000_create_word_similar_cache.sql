-- Cache table for quiz2 similar words (pre-computed top3 per source word)

CREATE TABLE IF NOT EXISTS word_similar_cache (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_word_id uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  similar_word_id uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  rank smallint NOT NULL CHECK (rank BETWEEN 1 AND 3),
  similarity double precision NOT NULL,
  source text NOT NULL CHECK (source IN ('vector', 'local')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_word_id, rank),
  UNIQUE (source_word_id, similar_word_id)
);

CREATE INDEX IF NOT EXISTS idx_word_similar_cache_user_source
  ON word_similar_cache (user_id, source_word_id);

CREATE INDEX IF NOT EXISTS idx_word_similar_cache_user_similar
  ON word_similar_cache (user_id, similar_word_id);

CREATE INDEX IF NOT EXISTS idx_word_similar_cache_updated_at_desc
  ON word_similar_cache (updated_at DESC);

ALTER TABLE word_similar_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_similar_cache'
      AND policyname = 'Users can view own similar cache'
  ) THEN
    CREATE POLICY "Users can view own similar cache"
      ON word_similar_cache FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_similar_cache'
      AND policyname = 'Users can create own similar cache'
  ) THEN
    CREATE POLICY "Users can create own similar cache"
      ON word_similar_cache FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_similar_cache'
      AND policyname = 'Users can update own similar cache'
  ) THEN
    CREATE POLICY "Users can update own similar cache"
      ON word_similar_cache FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_similar_cache'
      AND policyname = 'Users can delete own similar cache'
  ) THEN
    CREATE POLICY "Users can delete own similar cache"
      ON word_similar_cache FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;

