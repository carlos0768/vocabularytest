-- Shared lexicon master backed by OLP + runtime translation fill.

CREATE TABLE IF NOT EXISTS public.lexicon_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headword text NOT NULL,
  normalized_headword text NOT NULL,
  pos text NOT NULL CHECK (pos IN (
    'noun',
    'verb',
    'adjective',
    'adverb',
    'idiom',
    'phrasal_verb',
    'preposition',
    'conjunction',
    'pronoun',
    'determiner',
    'interjection',
    'auxiliary',
    'other'
  )),
  cefr_level text NULL CHECK (cefr_level IS NULL OR cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  dataset_sources text[] NOT NULL DEFAULT '{}',
  translation_ja text NULL,
  translation_source text NULL CHECK (translation_source IS NULL OR translation_source IN ('scan', 'ai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_headword, pos)
);

CREATE INDEX IF NOT EXISTS idx_lexicon_entries_normalized_headword
  ON public.lexicon_entries (normalized_headword);
CREATE INDEX IF NOT EXISTS idx_lexicon_entries_cefr_level
  ON public.lexicon_entries (cefr_level);

ALTER TABLE public.lexicon_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lexicon_entries'
      AND policyname = 'Anyone can view lexicon entries'
  ) THEN
    CREATE POLICY "Anyone can view lexicon entries"
      ON public.lexicon_entries
      FOR SELECT
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lexicon_entries'
      AND policyname = 'Service role can manage lexicon entries'
  ) THEN
    CREATE POLICY "Service role can manage lexicon entries"
      ON public.lexicon_entries
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_lexicon_entries_updated_at'
  ) THEN
    CREATE TRIGGER update_lexicon_entries_updated_at
      BEFORE UPDATE ON public.lexicon_entries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS lexicon_entry_id uuid REFERENCES public.lexicon_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS english_override text,
  ADD COLUMN IF NOT EXISTS japanese_override text;

CREATE INDEX IF NOT EXISTS idx_words_lexicon_entry_id
  ON public.words (lexicon_entry_id);

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
    COALESCE(NULLIF(BTRIM(w.english_override), ''), le.headword, w.english) AS english,
    COALESCE(NULLIF(BTRIM(w.japanese_override), ''), le.translation_ja, w.japanese) AS japanese,
    1 - (w.embedding <=> query_embedding) as similarity
  FROM public.words w
  JOIN public.projects p ON w.project_id = p.id
  LEFT JOIN public.lexicon_entries le ON le.id = w.lexicon_entry_id
  WHERE
    p.user_id = user_id_filter
    AND w.embedding IS NOT NULL
    AND (array_length(exclude_word_ids, 1) IS NULL OR w.id != ALL(exclude_word_ids))
    AND 1 - (w.embedding <=> query_embedding) > match_threshold
  ORDER BY w.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_words_by_embedding TO authenticated;

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
    COALESCE(NULLIF(BTRIM(w.english_override), ''), le.headword, w.english) AS english,
    COALESCE(NULLIF(BTRIM(w.japanese_override), ''), le.translation_ja, w.japanese) AS japanese
  FROM public.words w
  JOIN public.projects p ON w.project_id = p.id
  LEFT JOIN public.lexicon_entries le ON le.id = w.lexicon_entry_id
  WHERE
    p.user_id = user_id_filter
    AND w.embedding IS NULL
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION public.get_words_without_embedding TO authenticated;
