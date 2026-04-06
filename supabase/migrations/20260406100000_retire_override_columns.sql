-- ============================================================
-- Retire english_override / japanese_override from app logic
-- Columns remain in the table but are no longer read or written.
-- ============================================================

-- Part A: Backfill override values into canonical columns
UPDATE public.words
SET english = english_override
WHERE english_override IS NOT NULL
  AND BTRIM(english_override) != ''
  AND english IS DISTINCT FROM english_override;

UPDATE public.words
SET japanese = japanese_override
WHERE japanese_override IS NOT NULL
  AND BTRIM(japanese_override) != ''
  AND japanese IS DISTINCT FROM japanese_override;

-- Part B: Recreate match_words_by_embedding without override references
-- Uses lexicon_entries directly (not the resolved view) for broader compatibility.
CREATE OR REPLACE FUNCTION public.match_words_by_embedding(
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
    COALESCE(le.headword, w.english) AS english,
    COALESCE(le.translation_ja, w.japanese) AS japanese,
    1 - (w.embedding <=> query_embedding) AS similarity
  FROM public.words AS w
  JOIN public.projects AS p ON w.project_id = p.id
  LEFT JOIN public.lexicon_entries AS le ON le.id = w.lexicon_entry_id
  WHERE
    p.user_id = user_id_filter
    AND w.embedding IS NOT NULL
    AND (array_length(exclude_word_ids, 1) IS NULL OR w.id != ALL(exclude_word_ids))
    AND 1 - (w.embedding <=> query_embedding) > match_threshold
  ORDER BY w.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_words_by_embedding TO authenticated;

-- Part C: Recreate get_words_without_embedding without override references
CREATE OR REPLACE FUNCTION public.get_words_without_embedding(
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
    COALESCE(le.headword, w.english) AS english,
    COALESCE(le.translation_ja, w.japanese) AS japanese
  FROM public.words AS w
  JOIN public.projects AS p ON w.project_id = p.id
  LEFT JOIN public.lexicon_entries AS le ON le.id = w.lexicon_entry_id
  WHERE
    p.user_id = user_id_filter
    AND w.embedding IS NULL
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION public.get_words_without_embedding TO authenticated;
