-- Migration: Update get_words_without_embedding to return japanese column
-- Purpose: Enable bilingual (english + japanese) embedding generation
-- so users can search by Japanese meaning (e.g., "展望" → "prospect")

-- 1. Update get_words_without_embedding to also return japanese
CREATE OR REPLACE FUNCTION get_words_without_embedding(
  user_id_filter uuid,
  limit_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  english text,
  japanese text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.english,
    w.japanese
  FROM words w
  JOIN projects p ON w.project_id = p.id
  WHERE
    p.user_id = user_id_filter
    AND w.embedding IS NULL
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION get_words_without_embedding TO authenticated;

-- 2. Reset all existing embeddings so they get regenerated with bilingual text
-- This is safe because embeddings are regenerated automatically
UPDATE words SET embedding = NULL WHERE embedding IS NOT NULL;
