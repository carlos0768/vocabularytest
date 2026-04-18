-- Normalize lexicon masters and meanings/senses.

CREATE OR REPLACE FUNCTION public.normalize_lexicon_translation_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'), '');
$$;

CREATE TABLE IF NOT EXISTS public.lexicon_senses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lexicon_entry_id uuid NOT NULL REFERENCES public.lexicon_entries(id) ON DELETE CASCADE,
  translation_ja text NOT NULL,
  normalized_translation_ja text NOT NULL,
  meaning_summary text NULL,
  usage_notes text NULL,
  example_sentence text NULL,
  example_sentence_ja text NULL,
  translation_source text NULL CHECK (translation_source IS NULL OR translation_source IN ('scan', 'ai')),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lexicon_entry_id, normalized_translation_ja)
);

CREATE INDEX IF NOT EXISTS idx_lexicon_senses_lexicon_entry_id
  ON public.lexicon_senses (lexicon_entry_id);

CREATE INDEX IF NOT EXISTS idx_lexicon_senses_normalized_translation_ja
  ON public.lexicon_senses (normalized_translation_ja);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lexicon_senses_primary_per_entry
  ON public.lexicon_senses (lexicon_entry_id)
  WHERE is_primary;

ALTER TABLE public.lexicon_senses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lexicon_senses'
      AND policyname = 'Anyone can view lexicon senses'
  ) THEN
    CREATE POLICY "Anyone can view lexicon senses"
      ON public.lexicon_senses
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
      AND tablename = 'lexicon_senses'
      AND policyname = 'Service role can manage lexicon senses'
  ) THEN
    CREATE POLICY "Service role can manage lexicon senses"
      ON public.lexicon_senses
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
    WHERE tgname = 'update_lexicon_senses_updated_at'
  ) THEN
    CREATE TRIGGER update_lexicon_senses_updated_at
      BEFORE UPDATE ON public.lexicon_senses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS lexicon_sense_id uuid REFERENCES public.lexicon_senses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_words_lexicon_sense_id
  ON public.words (lexicon_sense_id);

INSERT INTO public.lexicon_senses (
  lexicon_entry_id,
  translation_ja,
  normalized_translation_ja,
  example_sentence,
  example_sentence_ja,
  translation_source,
  is_primary,
  created_at,
  updated_at
)
SELECT
  le.id,
  legacy.translation_ja,
  public.normalize_lexicon_translation_key(legacy.translation_ja) AS normalized_translation_ja,
  legacy.example_sentence,
  legacy.example_sentence_ja,
  le.translation_source,
  true,
  le.created_at,
  le.updated_at
FROM public.lexicon_entries AS le
CROSS JOIN LATERAL (
  SELECT
    nullif(btrim(le.translation_ja), '') AS translation_ja,
    nullif(btrim(le.example_sentence), '') AS example_sentence,
    nullif(btrim(le.example_sentence_ja), '') AS example_sentence_ja
) AS legacy
WHERE legacy.translation_ja IS NOT NULL
ON CONFLICT (lexicon_entry_id, normalized_translation_ja) DO UPDATE
SET
  example_sentence = COALESCE(public.lexicon_senses.example_sentence, EXCLUDED.example_sentence),
  example_sentence_ja = COALESCE(public.lexicon_senses.example_sentence_ja, EXCLUDED.example_sentence_ja),
  translation_source = COALESCE(public.lexicon_senses.translation_source, EXCLUDED.translation_source),
  is_primary = public.lexicon_senses.is_primary OR EXCLUDED.is_primary;

WITH word_seed_rows AS (
  SELECT DISTINCT ON (w.lexicon_entry_id, public.normalize_lexicon_translation_key(w.japanese))
    w.lexicon_entry_id,
    nullif(btrim(w.japanese), '') AS translation_ja,
    public.normalize_lexicon_translation_key(w.japanese) AS normalized_translation_ja,
    nullif(btrim(w.example_sentence), '') AS example_sentence,
    nullif(btrim(w.example_sentence_ja), '') AS example_sentence_ja,
    CASE
      WHEN w.japanese_source IN ('scan', 'ai') THEN w.japanese_source
      ELSE NULL
    END AS translation_source,
    w.created_at
  FROM public.words AS w
  WHERE w.lexicon_entry_id IS NOT NULL
    AND public.normalize_lexicon_translation_key(w.japanese) IS NOT NULL
  ORDER BY
    w.lexicon_entry_id,
    public.normalize_lexicon_translation_key(w.japanese),
    CASE WHEN nullif(btrim(w.example_sentence), '') IS NOT NULL THEN 0 ELSE 1 END,
    w.created_at
)
INSERT INTO public.lexicon_senses (
  lexicon_entry_id,
  translation_ja,
  normalized_translation_ja,
  example_sentence,
  example_sentence_ja,
  translation_source,
  is_primary,
  created_at,
  updated_at
)
SELECT
  seed.lexicon_entry_id,
  seed.translation_ja,
  seed.normalized_translation_ja,
  seed.example_sentence,
  seed.example_sentence_ja,
  seed.translation_source,
  false,
  seed.created_at,
  seed.created_at
FROM word_seed_rows AS seed
WHERE seed.translation_ja IS NOT NULL
ON CONFLICT (lexicon_entry_id, normalized_translation_ja) DO UPDATE
SET
  example_sentence = COALESCE(public.lexicon_senses.example_sentence, EXCLUDED.example_sentence),
  example_sentence_ja = COALESCE(public.lexicon_senses.example_sentence_ja, EXCLUDED.example_sentence_ja),
  translation_source = COALESCE(public.lexicon_senses.translation_source, EXCLUDED.translation_source);

WITH duplicate_primaries AS (
  SELECT
    ls.id,
    row_number() OVER (
      PARTITION BY ls.lexicon_entry_id
      ORDER BY ls.created_at ASC, ls.id ASC
    ) AS primary_rank
  FROM public.lexicon_senses AS ls
  WHERE ls.is_primary
)
UPDATE public.lexicon_senses AS ls
SET is_primary = false
FROM duplicate_primaries AS dp
WHERE ls.id = dp.id
  AND dp.primary_rank > 1;

WITH missing_primary AS (
  SELECT DISTINCT ON (ls.lexicon_entry_id)
    ls.id
  FROM public.lexicon_senses AS ls
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.lexicon_senses AS current_primary
    WHERE current_primary.lexicon_entry_id = ls.lexicon_entry_id
      AND current_primary.is_primary
  )
  ORDER BY ls.lexicon_entry_id, ls.created_at ASC, ls.id ASC
)
UPDATE public.lexicon_senses AS ls
SET is_primary = true
FROM missing_primary AS mp
WHERE ls.id = mp.id;

UPDATE public.words AS w
SET lexicon_sense_id = ls.id
FROM public.lexicon_senses AS ls
WHERE w.lexicon_entry_id = ls.lexicon_entry_id
  AND public.normalize_lexicon_translation_key(w.japanese) = ls.normalized_translation_ja
  AND (w.lexicon_sense_id IS DISTINCT FROM ls.id);

CREATE OR REPLACE VIEW public.lexicon_entry_resolved_rows AS
SELECT
  le.id,
  le.headword,
  le.normalized_headword,
  le.pos,
  le.cefr_level,
  le.dataset_sources,
  ps.id AS primary_sense_id,
  ps.translation_ja,
  ps.normalized_translation_ja,
  ps.meaning_summary,
  ps.usage_notes,
  ps.example_sentence,
  ps.example_sentence_ja,
  ps.translation_source,
  le.created_at,
  le.updated_at
FROM public.lexicon_entries AS le
LEFT JOIN LATERAL (
  SELECT
    ls.id,
    ls.translation_ja,
    ls.normalized_translation_ja,
    ls.meaning_summary,
    ls.usage_notes,
    ls.example_sentence,
    ls.example_sentence_ja,
    ls.translation_source
  FROM public.lexicon_senses AS ls
  WHERE ls.lexicon_entry_id = le.id
  ORDER BY ls.is_primary DESC, ls.created_at ASC, ls.id ASC
  LIMIT 1
) AS ps ON true;

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
    COALESCE(NULLIF(BTRIM(w.english_override), ''), ler.headword, w.english) AS english,
    COALESCE(
      NULLIF(BTRIM(w.japanese_override), ''),
      linked_sense.translation_ja,
      ler.translation_ja,
      w.japanese
    ) AS japanese,
    1 - (w.embedding <=> query_embedding) AS similarity
  FROM public.words AS w
  JOIN public.projects AS p ON w.project_id = p.id
  LEFT JOIN public.lexicon_entry_resolved_rows AS ler ON ler.id = w.lexicon_entry_id
  LEFT JOIN public.lexicon_senses AS linked_sense ON linked_sense.id = w.lexicon_sense_id
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
    COALESCE(NULLIF(BTRIM(w.english_override), ''), ler.headword, w.english) AS english,
    COALESCE(
      NULLIF(BTRIM(w.japanese_override), ''),
      linked_sense.translation_ja,
      ler.translation_ja,
      w.japanese
    ) AS japanese
  FROM public.words AS w
  JOIN public.projects AS p ON w.project_id = p.id
  LEFT JOIN public.lexicon_entry_resolved_rows AS ler ON ler.id = w.lexicon_entry_id
  LEFT JOIN public.lexicon_senses AS linked_sense ON linked_sense.id = w.lexicon_sense_id
  WHERE
    p.user_id = user_id_filter
    AND w.embedding IS NULL
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION public.get_words_without_embedding TO authenticated;

DROP FUNCTION IF EXISTS public.get_lexicon_entries_by_keys(jsonb);

CREATE OR REPLACE FUNCTION public.get_lexicon_entries_by_keys(p_keys jsonb)
RETURNS TABLE (
  id uuid,
  headword text,
  normalized_headword text,
  pos text,
  cefr_level text,
  dataset_sources text[],
  primary_sense_id uuid,
  translation_ja text,
  normalized_translation_ja text,
  meaning_summary text,
  usage_notes text,
  translation_source text,
  example_sentence text,
  example_sentence_ja text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input_keys AS (
    SELECT DISTINCT
      nullif(trim(item->>'normalized_headword'), '') AS normalized_headword,
      nullif(trim(item->>'pos'), '') AS pos
    FROM jsonb_array_elements(COALESCE(p_keys, '[]'::jsonb)) AS item
  )
  SELECT
    ler.id,
    ler.headword,
    ler.normalized_headword,
    ler.pos,
    ler.cefr_level,
    ler.dataset_sources,
    ler.primary_sense_id,
    ler.translation_ja,
    ler.normalized_translation_ja,
    ler.meaning_summary,
    ler.usage_notes,
    ler.translation_source,
    ler.example_sentence,
    ler.example_sentence_ja,
    ler.created_at,
    ler.updated_at
  FROM public.lexicon_entry_resolved_rows AS ler
  INNER JOIN input_keys AS ik
    ON ik.normalized_headword = ler.normalized_headword
   AND ik.pos = ler.pos
  WHERE ik.normalized_headword IS NOT NULL
    AND ik.pos IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.batch_update_word_lexicon_links(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.words AS w
  SET
    lexicon_entry_id = COALESCE((u.elem->>'lexicon_entry_id')::uuid, w.lexicon_entry_id),
    lexicon_sense_id = COALESCE((u.elem->>'lexicon_sense_id')::uuid, w.lexicon_sense_id),
    part_of_speech_tags = CASE
      WHEN u.elem->'part_of_speech_tags' IS NOT NULL AND u.elem->'part_of_speech_tags' != 'null'::jsonb
        THEN u.elem->'part_of_speech_tags'
      ELSE w.part_of_speech_tags
    END
  FROM jsonb_array_elements(updates) AS u(elem)
  WHERE w.id = (u.elem->>'id')::uuid;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'nightly-lexicon-example-backfill'
  ) THEN
    PERFORM cron.unschedule('nightly-lexicon-example-backfill');
  END IF;
END $$;

SELECT cron.schedule(
  'nightly-lexicon-example-backfill',
  '0 19 * * *',
  $$
  UPDATE public.lexicon_senses AS ls
  SET
    example_sentence = w.example_sentence,
    example_sentence_ja = w.example_sentence_ja,
    updated_at = now()
  FROM public.words AS w
  WHERE w.lexicon_sense_id = ls.id
    AND ls.example_sentence IS NULL
    AND w.example_sentence IS NOT NULL
    AND btrim(w.example_sentence) <> '';
  $$
);

ALTER TABLE public.lexicon_entries
  DROP COLUMN IF EXISTS translation_ja,
  DROP COLUMN IF EXISTS translation_source,
  DROP COLUMN IF EXISTS example_sentence,
  DROP COLUMN IF EXISTS example_sentence_ja;
