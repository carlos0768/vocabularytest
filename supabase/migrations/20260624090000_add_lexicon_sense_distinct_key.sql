-- Add an explicit grouping key for lexicon senses that should be tested as
-- distinct meanings. The production schema may have word_translations and
-- words.lexicon_sense_id before lexicon_senses, so this migration also creates
-- and backfills lexicon_senses when it is missing.

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
  distinct_key text NULL,
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

ALTER TABLE public.lexicon_senses
  ADD COLUMN IF NOT EXISTS distinct_key text;

CREATE INDEX IF NOT EXISTS idx_lexicon_senses_lexicon_entry_id
  ON public.lexicon_senses (lexicon_entry_id);

CREATE INDEX IF NOT EXISTS idx_lexicon_senses_normalized_translation_ja
  ON public.lexicon_senses (normalized_translation_ja);

CREATE INDEX IF NOT EXISTS idx_lexicon_senses_distinct_key
  ON public.lexicon_senses (lexicon_entry_id, distinct_key)
  WHERE distinct_key IS NOT NULL;

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
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'update_lexicon_senses_updated_at'
        AND tgrelid = 'public.lexicon_senses'::regclass
    )
  THEN
    CREATE TRIGGER update_lexicon_senses_updated_at
      BEFORE UPDATE ON public.lexicon_senses
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.words') IS NOT NULL THEN
    ALTER TABLE public.words
      ADD COLUMN IF NOT EXISTS lexicon_sense_id uuid;
  END IF;
END
$$;

DO $$
DECLARE
  translation_source_expr text := 'NULL::text';
  example_sentence_expr text := 'NULL::text';
  example_sentence_ja_expr text := 'NULL::text';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lexicon_entries'
      AND column_name = 'translation_ja'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lexicon_entries'
      AND column_name = 'translation_source'
  ) THEN
    translation_source_expr := 'CASE WHEN le.translation_source IN (''scan'', ''ai'') THEN le.translation_source ELSE NULL END';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lexicon_entries'
      AND column_name = 'example_sentence'
  ) THEN
    example_sentence_expr := 'nullif(btrim(le.example_sentence), '''')';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lexicon_entries'
      AND column_name = 'example_sentence_ja'
  ) THEN
    example_sentence_ja_expr := 'nullif(btrim(le.example_sentence_ja), '''')';
  END IF;

  EXECUTE format($sql$
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
      public.normalize_lexicon_translation_key(legacy.translation_ja),
      legacy.example_sentence,
      legacy.example_sentence_ja,
      %s,
      true,
      le.created_at,
      le.updated_at
    FROM public.lexicon_entries AS le
    CROSS JOIN LATERAL (
      SELECT
        nullif(btrim(le.translation_ja), '') AS translation_ja,
        %s AS example_sentence,
        %s AS example_sentence_ja
    ) AS legacy
    WHERE legacy.translation_ja IS NOT NULL
    ON CONFLICT (lexicon_entry_id, normalized_translation_ja) DO UPDATE
    SET
      example_sentence = COALESCE(public.lexicon_senses.example_sentence, EXCLUDED.example_sentence),
      example_sentence_ja = COALESCE(public.lexicon_senses.example_sentence_ja, EXCLUDED.example_sentence_ja),
      translation_source = COALESCE(public.lexicon_senses.translation_source, EXCLUDED.translation_source),
      is_primary = public.lexicon_senses.is_primary OR EXCLUDED.is_primary
  $sql$, translation_source_expr, example_sentence_expr, example_sentence_ja_expr);
END
$$;

DO $$
DECLARE
  source_expr text := 'NULL::text';
  example_sentence_expr text := 'NULL::text';
  example_sentence_ja_expr text := 'NULL::text';
  created_at_expr text := 'now()';
  updated_at_expr text := 'now()';
  example_order_expr text := '1';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'lexicon_entry_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'japanese'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'japanese_source'
  ) THEN
    source_expr := 'CASE WHEN w.japanese_source IN (''scan'', ''ai'') THEN w.japanese_source ELSE NULL END';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'example_sentence'
  ) THEN
    example_sentence_expr := 'nullif(btrim(w.example_sentence), '''')';
    example_order_expr := 'CASE WHEN nullif(btrim(w.example_sentence), '''') IS NOT NULL THEN 0 ELSE 1 END';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'example_sentence_ja'
  ) THEN
    example_sentence_ja_expr := 'nullif(btrim(w.example_sentence_ja), '''')';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'created_at'
  ) THEN
    created_at_expr := 'w.created_at';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'updated_at'
  ) THEN
    updated_at_expr := 'w.updated_at';
  END IF;

  EXECUTE format($sql$
    WITH word_seed_rows AS (
      SELECT DISTINCT ON (w.lexicon_entry_id, public.normalize_lexicon_translation_key(w.japanese))
        w.lexicon_entry_id,
        nullif(btrim(w.japanese), '') AS translation_ja,
        public.normalize_lexicon_translation_key(w.japanese) AS normalized_translation_ja,
        %s AS example_sentence,
        %s AS example_sentence_ja,
        %s AS translation_source,
        %s AS created_at,
        %s AS updated_at
      FROM public.words AS w
      WHERE w.lexicon_entry_id IS NOT NULL
        AND public.normalize_lexicon_translation_key(w.japanese) IS NOT NULL
      ORDER BY
        w.lexicon_entry_id,
        public.normalize_lexicon_translation_key(w.japanese),
        %s,
        %s
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
      seed.updated_at
    FROM word_seed_rows AS seed
    WHERE seed.translation_ja IS NOT NULL
    ON CONFLICT (lexicon_entry_id, normalized_translation_ja) DO UPDATE
    SET
      example_sentence = COALESCE(public.lexicon_senses.example_sentence, EXCLUDED.example_sentence),
      example_sentence_ja = COALESCE(public.lexicon_senses.example_sentence_ja, EXCLUDED.example_sentence_ja),
      translation_source = COALESCE(public.lexicon_senses.translation_source, EXCLUDED.translation_source)
  $sql$, example_sentence_expr, example_sentence_ja_expr, source_expr, created_at_expr, updated_at_expr, example_order_expr, created_at_expr);
END
$$;

DO $$
DECLARE
  normalized_expr text;
  source_expr text := 'NULL::text';
  created_at_expr text := 'now()';
  updated_at_expr text := 'now()';
  position_expr text := '0';
BEGIN
  IF to_regclass('public.word_translations') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'word_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'translation_ja'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'lexicon_entry_id'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'normalized_translation_ja'
  ) THEN
    normalized_expr := 'COALESCE(NULLIF(btrim(wt.normalized_translation_ja), ''''), public.normalize_lexicon_translation_key(wt.translation_ja))';
  ELSE
    normalized_expr := 'public.normalize_lexicon_translation_key(wt.translation_ja)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'source'
  ) THEN
    source_expr := 'CASE WHEN wt.source IN (''scan'', ''ai'') THEN wt.source ELSE NULL END';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'created_at'
  ) THEN
    created_at_expr := 'wt.created_at';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'updated_at'
  ) THEN
    updated_at_expr := 'wt.updated_at';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'position'
  ) THEN
    position_expr := 'wt.position';
  END IF;

  EXECUTE format($sql$
    WITH translation_seed_rows AS (
      SELECT DISTINCT ON (w.lexicon_entry_id, %s)
        w.lexicon_entry_id,
        nullif(btrim(wt.translation_ja), '') AS translation_ja,
        %s AS normalized_translation_ja,
        %s AS translation_source,
        %s AS created_at,
        %s AS updated_at,
        %s AS position
      FROM public.word_translations AS wt
      JOIN public.words AS w ON w.id = wt.word_id
      WHERE w.lexicon_entry_id IS NOT NULL
        AND %s IS NOT NULL
      ORDER BY
        w.lexicon_entry_id,
        %s,
        %s,
        %s
    )
    INSERT INTO public.lexicon_senses (
      lexicon_entry_id,
      translation_ja,
      normalized_translation_ja,
      translation_source,
      is_primary,
      created_at,
      updated_at
    )
    SELECT
      seed.lexicon_entry_id,
      seed.translation_ja,
      seed.normalized_translation_ja,
      seed.translation_source,
      false,
      seed.created_at,
      seed.updated_at
    FROM translation_seed_rows AS seed
    WHERE seed.translation_ja IS NOT NULL
    ON CONFLICT (lexicon_entry_id, normalized_translation_ja) DO UPDATE
    SET
      translation_source = COALESCE(public.lexicon_senses.translation_source, EXCLUDED.translation_source)
  $sql$, normalized_expr, normalized_expr, source_expr, created_at_expr, updated_at_expr, position_expr, normalized_expr, normalized_expr, position_expr, created_at_expr);
END
$$;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_lexicon_senses_primary_per_entry
  ON public.lexicon_senses (lexicon_entry_id)
  WHERE is_primary;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'lexicon_entry_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'japanese'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'lexicon_sense_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.words AS w
      SET lexicon_sense_id = ls.id
      FROM public.lexicon_senses AS ls
      WHERE w.lexicon_entry_id = ls.lexicon_entry_id
        AND public.normalize_lexicon_translation_key(w.japanese) = ls.normalized_translation_ja
        AND (w.lexicon_sense_id IS DISTINCT FROM ls.id)
    $sql$;

    EXECUTE $sql$
      UPDATE public.words AS w
      SET lexicon_sense_id = NULL
      WHERE w.lexicon_sense_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.lexicon_senses AS ls
          WHERE ls.id = w.lexicon_sense_id
        )
    $sql$;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_words_lexicon_sense_id
  ON public.words (lexicon_sense_id);

DO $$
BEGIN
  IF to_regclass('public.words') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'words_lexicon_sense_id_fkey'
        AND conrelid = 'public.words'::regclass
    )
  THEN
    ALTER TABLE public.words
      ADD CONSTRAINT words_lexicon_sense_id_fkey
      FOREIGN KEY (lexicon_sense_id)
      REFERENCES public.lexicon_senses(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
DECLARE
  normalized_expr text;
BEGIN
  IF to_regclass('public.word_translations') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'lexicon_sense_id'
  ) THEN
    ALTER TABLE public.word_translations
      ADD COLUMN lexicon_sense_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'translation_ja'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'word_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'lexicon_entry_id'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'word_translations'
      AND column_name = 'normalized_translation_ja'
  ) THEN
    normalized_expr := 'COALESCE(NULLIF(btrim(wt.normalized_translation_ja), ''''), public.normalize_lexicon_translation_key(wt.translation_ja))';
  ELSE
    normalized_expr := 'public.normalize_lexicon_translation_key(wt.translation_ja)';
  END IF;

  EXECUTE format($sql$
    UPDATE public.word_translations AS wt
    SET lexicon_sense_id = ls.id
    FROM public.words AS w, public.lexicon_senses AS ls
    WHERE w.id = wt.word_id
      AND ls.lexicon_entry_id = w.lexicon_entry_id
      AND ls.normalized_translation_ja = %s
      AND (wt.lexicon_sense_id IS DISTINCT FROM ls.id)
  $sql$, normalized_expr);

  UPDATE public.word_translations AS wt
  SET lexicon_sense_id = NULL
  WHERE wt.lexicon_sense_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.lexicon_senses AS ls
      WHERE ls.id = wt.lexicon_sense_id
    );
END
$$;

DO $$
BEGIN
  IF to_regclass('public.word_translations') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_word_translations_lexicon_sense_id
      ON public.word_translations (lexicon_sense_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.word_translations') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'word_translations_lexicon_sense_id_fkey'
        AND conrelid = 'public.word_translations'::regclass
    )
  THEN
    ALTER TABLE public.word_translations
      ADD CONSTRAINT word_translations_lexicon_sense_id_fkey
      FOREIGN KEY (lexicon_sense_id)
      REFERENCES public.lexicon_senses(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

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
  le.updated_at,
  ps.distinct_key
FROM public.lexicon_entries AS le
LEFT JOIN LATERAL (
  SELECT
    ls.id,
    ls.translation_ja,
    ls.normalized_translation_ja,
    ls.distinct_key,
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
  distinct_key text,
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
    ler.distinct_key,
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
