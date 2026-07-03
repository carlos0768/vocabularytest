-- ============================================
-- Merken Reel phase 2:
--   1) word-level comments
--   2) interested / not-interested feedback
--   3) shared_wordbooks tag embeddings (semantic ranking)
-- ============================================

-- 1) Comments on reel items (public content -> publicly readable).
CREATE TABLE IF NOT EXISTS reel_word_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_word_id UUID NULL REFERENCES shared_wordbook_words(id) ON DELETE CASCADE,
  official_word_id UUID NULL REFERENCES words(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reel_word_comments_exactly_one_source CHECK (
    ((shared_word_id IS NOT NULL)::int + (official_word_id IS NOT NULL)::int) = 1
  )
);

CREATE INDEX IF NOT EXISTS reel_word_comments_shared_idx
  ON reel_word_comments(shared_word_id, created_at DESC)
  WHERE shared_word_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reel_word_comments_official_idx
  ON reel_word_comments(official_word_id, created_at DESC)
  WHERE official_word_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reel_word_comments_user_idx
  ON reel_word_comments(user_id);

ALTER TABLE reel_word_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reel_word_comments_select_all ON reel_word_comments;
CREATE POLICY reel_word_comments_select_all
  ON reel_word_comments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS reel_word_comments_insert_self ON reel_word_comments;
CREATE POLICY reel_word_comments_insert_self
  ON reel_word_comments FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS reel_word_comments_delete_own ON reel_word_comments;
CREATE POLICY reel_word_comments_delete_own
  ON reel_word_comments FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- 2) Interested / not-interested feedback.
-- book_ref ('s:<share_id>' | 'o:<official_slug>') is denormalized so the
-- feed can aggregate book-level preference without joins; it is derived
-- server-side from the word row, never trusted from the client.
CREATE TABLE IF NOT EXISTS reel_word_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_word_id UUID NULL REFERENCES shared_wordbook_words(id) ON DELETE CASCADE,
  official_word_id UUID NULL REFERENCES words(id) ON DELETE CASCADE,
  book_ref TEXT NOT NULL,
  feedback TEXT NOT NULL CHECK (feedback IN ('interested', 'not_interested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reel_word_feedback_exactly_one_source CHECK (
    ((shared_word_id IS NOT NULL)::int + (official_word_id IS NOT NULL)::int) = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reel_word_feedback_user_shared_key
  ON reel_word_feedback(user_id, shared_word_id)
  WHERE shared_word_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reel_word_feedback_user_official_key
  ON reel_word_feedback(user_id, official_word_id)
  WHERE official_word_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reel_word_feedback_user_book_idx
  ON reel_word_feedback(user_id, book_ref);

ALTER TABLE reel_word_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reel_word_feedback_select_own ON reel_word_feedback;
CREATE POLICY reel_word_feedback_select_own
  ON reel_word_feedback FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS reel_word_feedback_insert_self ON reel_word_feedback;
CREATE POLICY reel_word_feedback_insert_self
  ON reel_word_feedback FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS reel_word_feedback_update_own ON reel_word_feedback;
CREATE POLICY reel_word_feedback_update_own
  ON reel_word_feedback FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS reel_word_feedback_delete_own ON reel_word_feedback;
CREATE POLICY reel_word_feedback_delete_own
  ON reel_word_feedback FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- 3) Tag embedding on the published snapshot itself (the live
-- projects.shared_tags_embedding does not transfer to shared_wordbooks).
ALTER TABLE shared_wordbooks
  ADD COLUMN IF NOT EXISTS shared_tags_embedding vector(1536) NULL;

CREATE INDEX IF NOT EXISTS shared_wordbooks_tags_embedding_idx
  ON shared_wordbooks
  USING hnsw (shared_tags_embedding vector_cosine_ops);

COMMENT ON COLUMN public.shared_wordbooks.shared_tags_embedding IS
  'OpenAI text-embedding-3-small vector of shared_tags, used for semantic reel-feed tag affinity';

DROP FUNCTION IF EXISTS public.match_shared_wordbooks_by_tag_embedding(vector, float, int);
CREATE OR REPLACE FUNCTION public.match_shared_wordbooks_by_tag_embedding(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.2,
  match_count int DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  similarity float
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id,
    1 - (b.shared_tags_embedding <=> query_embedding) AS similarity
  FROM shared_wordbooks b
  WHERE b.shared_tags_embedding IS NOT NULL
    AND b.word_count > 0
    AND 1 - (b.shared_tags_embedding <=> query_embedding) >= match_threshold
  ORDER BY b.shared_tags_embedding <=> query_embedding
  LIMIT LEAST(match_count, 200);
$$;

REVOKE ALL ON FUNCTION public.match_shared_wordbooks_by_tag_embedding(vector, float, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_shared_wordbooks_by_tag_embedding(vector, float, int) TO authenticated;
