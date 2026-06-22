-- Store multiple Japanese translations per user word.
-- words.japanese remains a primary-translation display cache for compatibility.

CREATE TABLE IF NOT EXISTS public.word_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  lexicon_sense_id uuid NULL,
  translation_ja text NOT NULL,
  normalized_translation_ja text NOT NULL,
  source text NULL CHECK (source IS NULL OR source IN ('scan', 'ai', 'user')),
  meaning_rank integer NOT NULL DEFAULT 1 CHECK (meaning_rank >= 1),
  position integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (word_id, normalized_translation_ja)
);

DO $$
BEGIN
  IF to_regclass('public.lexicon_senses') IS NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_word_translations_word_id
  ON public.word_translations (word_id);

CREATE INDEX IF NOT EXISTS idx_word_translations_lexicon_sense_id
  ON public.word_translations (lexicon_sense_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_word_translations_primary_per_word
  ON public.word_translations (word_id)
  WHERE is_primary;

ALTER TABLE public.word_translations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_translations'
      AND policyname = 'Users can view translations for own words'
  ) THEN
    CREATE POLICY "Users can view translations for own words"
      ON public.word_translations
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.words w
          JOIN public.projects p ON p.id = w.project_id
          WHERE w.id = word_translations.word_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_translations'
      AND policyname = 'Users can create translations for own words'
  ) THEN
    CREATE POLICY "Users can create translations for own words"
      ON public.word_translations
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.words w
          JOIN public.projects p ON p.id = w.project_id
          WHERE w.id = word_translations.word_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_translations'
      AND policyname = 'Users can update translations for own words'
  ) THEN
    CREATE POLICY "Users can update translations for own words"
      ON public.word_translations
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.words w
          JOIN public.projects p ON p.id = w.project_id
          WHERE w.id = word_translations.word_id
            AND p.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.words w
          JOIN public.projects p ON p.id = w.project_id
          WHERE w.id = word_translations.word_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_translations'
      AND policyname = 'Users can delete translations for own words'
  ) THEN
    CREATE POLICY "Users can delete translations for own words"
      ON public.word_translations
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.words w
          JOIN public.projects p ON p.id = w.project_id
          WHERE w.id = word_translations.word_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_translations'
      AND policyname = 'Service role can manage word translations'
  ) THEN
    CREATE POLICY "Service role can manage word translations"
      ON public.word_translations
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
      WHERE tgname = 'update_word_translations_updated_at'
    )
  THEN
    CREATE TRIGGER update_word_translations_updated_at
      BEFORE UPDATE ON public.word_translations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

DO $$
DECLARE
  lexicon_sense_expr text := 'NULL::uuid';
  normalized_expr text;
BEGIN
  IF NOT EXISTS (
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
      AND column_name = 'lexicon_sense_id'
  ) THEN
    lexicon_sense_expr := 'w.lexicon_sense_id';
  END IF;

  IF to_regprocedure('public.normalize_lexicon_translation_key(text)') IS NOT NULL THEN
    normalized_expr := 'public.normalize_lexicon_translation_key(w.japanese)';
  ELSE
    normalized_expr := 'NULLIF(lower(regexp_replace(btrim(w.japanese), ''\s+'', '' '', ''g'')), '''')';
  END IF;

  EXECUTE format($sql$
    INSERT INTO public.word_translations (
      word_id,
      lexicon_sense_id,
      translation_ja,
      normalized_translation_ja,
      source,
      meaning_rank,
      position,
      is_primary,
      created_at,
      updated_at
    )
    SELECT
      w.id,
      %s,
      btrim(w.japanese),
      %s,
      NULL,
      1,
      0,
      true,
      w.created_at,
      w.updated_at
    FROM public.words w
    WHERE %s IS NOT NULL
    ON CONFLICT (word_id, normalized_translation_ja) DO UPDATE
    SET
      lexicon_sense_id = COALESCE(public.word_translations.lexicon_sense_id, EXCLUDED.lexicon_sense_id),
      meaning_rank = LEAST(public.word_translations.meaning_rank, EXCLUDED.meaning_rank),
      is_primary = public.word_translations.is_primary OR EXCLUDED.is_primary,
      position = LEAST(public.word_translations.position, EXCLUDED.position)
  $sql$, lexicon_sense_expr, normalized_expr, normalized_expr);
END
$$;
