-- Migration: Add pgvector support for semantic word search
-- Purpose: Enable VectorDB-powered sentence quiz with cross-project word matching

-- 1. Enable pgvector extension
-- Note: On Supabase, pgvector is installed in the public schema
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to words table
-- Using 1536 dimensions for OpenAI text-embedding-3-small model
ALTER TABLE words
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Create HNSW index for fast approximate nearest neighbor search
-- HNSW (Hierarchical Navigable Small World) provides excellent query performance
CREATE INDEX IF NOT EXISTS idx_words_embedding
ON words USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 4. Create function for semantic word search
-- This function finds similar words from a user's vocabulary across all projects
CREATE OR REPLACE FUNCTION match_words_by_embedding(
  query_embedding vector(1536),
  user_id_filter uuid,
  exclude_word_ids uuid[] DEFAULT '{}',
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  english text,
  japanese text,
  similarity float
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.project_id,
    w.english,
    w.japanese,
    1 - (w.embedding <=> query_embedding) as similarity
  FROM words w
  JOIN projects p ON w.project_id = p.id
  WHERE
    p.user_id = user_id_filter
    AND w.embedding IS NOT NULL
    AND (array_length(exclude_word_ids, 1) IS NULL OR w.id != ALL(exclude_word_ids))
    AND 1 - (w.embedding <=> query_embedding) > match_threshold
  ORDER BY w.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

-- 5. Grant execute permission on the function
GRANT EXECUTE ON FUNCTION match_words_by_embedding TO authenticated;

-- 6. Create helper function to check if a word has embedding
CREATE OR REPLACE FUNCTION get_words_without_embedding(
  user_id_filter uuid,
  limit_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  english text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.english
  FROM words w
  JOIN projects p ON w.project_id = p.id
  WHERE
    p.user_id = user_id_filter
    AND w.embedding IS NULL
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION get_words_without_embedding TO authenticated;

-- 7. Create function to update word embedding
CREATE OR REPLACE FUNCTION update_word_embedding(
  word_id uuid,
  new_embedding vector(1536)
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE words
  SET embedding = new_embedding
  WHERE id = word_id;
$$;

GRANT EXECUTE ON FUNCTION update_word_embedding TO authenticated;

-- 8. Add comment for documentation
COMMENT ON COLUMN words.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions) for semantic search';
COMMENT ON FUNCTION match_words_by_embedding IS 'Find semantically similar words from user vocabulary for sentence quiz';
