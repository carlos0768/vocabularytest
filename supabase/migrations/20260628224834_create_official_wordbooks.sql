-- Official default wordbooks used to seed a new user's first study set.
-- The tables can be empty while content is prepared; signup import treats
-- missing rows as a null result and continues.

CREATE TABLE IF NOT EXISTS public.official_wordbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  description text NULL,
  eiken_level text NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  source_labels text[] NOT NULL DEFAULT ARRAY['official']::text[],
  icon_image text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT official_wordbooks_slug_unique UNIQUE (slug),
  CONSTRAINT official_wordbooks_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,80}$'),
  CONSTRAINT official_wordbooks_eiken_level_check
    CHECK (eiken_level IS NULL OR eiken_level IN ('5', '4', '3', 'pre2', '2', 'pre1', '1')),
  CONSTRAINT official_wordbooks_title_non_empty
    CHECK (btrim(title) <> ''),
  CONSTRAINT official_wordbooks_source_labels_non_empty
    CHECK (array_length(source_labels, 1) IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.official_wordbook_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_wordbook_id uuid NOT NULL REFERENCES public.official_wordbooks(id) ON DELETE CASCADE,
  english text NOT NULL,
  japanese text NULL,
  translations jsonb NOT NULL DEFAULT '[]'::jsonb,
  distractors jsonb NOT NULL DEFAULT '[]'::jsonb,
  vocabulary_type text NULL CHECK (vocabulary_type IS NULL OR vocabulary_type IN ('active', 'passive')),
  japanese_source text NULL CHECK (japanese_source IS NULL OR japanese_source IN ('scan', 'ai')),
  lexicon_entry_id uuid NULL,
  lexicon_sense_id uuid NULL,
  example_sentence text NULL,
  example_sentence_ja text NULL,
  pronunciation text NULL,
  part_of_speech_tags text[] NULL,
  related_words jsonb NULL,
  usage_patterns jsonb NULL,
  word_order_quiz jsonb NULL,
  custom_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT official_wordbook_words_english_non_empty
    CHECK (btrim(english) <> ''),
  CONSTRAINT official_wordbook_words_translations_array
    CHECK (jsonb_typeof(translations) = 'array'),
  CONSTRAINT official_wordbook_words_distractors_array
    CHECK (jsonb_typeof(distractors) = 'array'),
  CONSTRAINT official_wordbook_words_custom_sections_array
    CHECK (jsonb_typeof(custom_sections) = 'array'),
  CONSTRAINT official_wordbook_words_related_words_array
    CHECK (related_words IS NULL OR jsonb_typeof(related_words) = 'array'),
  CONSTRAINT official_wordbook_words_usage_patterns_array
    CHECK (usage_patterns IS NULL OR jsonb_typeof(usage_patterns) = 'array')
);

DO $$
BEGIN
  IF to_regclass('public.lexicon_entries') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'official_wordbook_words_lexicon_entry_id_fkey'
        AND conrelid = 'public.official_wordbook_words'::regclass
    )
  THEN
    ALTER TABLE public.official_wordbook_words
      ADD CONSTRAINT official_wordbook_words_lexicon_entry_id_fkey
      FOREIGN KEY (lexicon_entry_id)
      REFERENCES public.lexicon_entries(id)
      ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.lexicon_senses') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'official_wordbook_words_lexicon_sense_id_fkey'
        AND conrelid = 'public.official_wordbook_words'::regclass
    )
  THEN
    ALTER TABLE public.official_wordbook_words
      ADD CONSTRAINT official_wordbook_words_lexicon_sense_id_fkey
      FOREIGN KEY (lexicon_sense_id)
      REFERENCES public.lexicon_senses(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_official_wordbooks_one_default_per_level
  ON public.official_wordbooks (eiken_level)
  WHERE is_default AND is_active AND eiken_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_wordbooks_level_default
  ON public.official_wordbooks (eiken_level, is_default DESC, sort_order)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_official_wordbook_words_book_order
  ON public.official_wordbook_words (official_wordbook_id, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_official_wordbook_words_unique_term
  ON public.official_wordbook_words (official_wordbook_id, lower(btrim(english)));

ALTER TABLE public.official_wordbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_wordbook_words ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.official_wordbooks TO authenticated;
GRANT SELECT ON TABLE public.official_wordbook_words TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.official_wordbooks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.official_wordbook_words TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'official_wordbooks'
      AND policyname = 'Authenticated users can view active official wordbooks'
  ) THEN
    CREATE POLICY "Authenticated users can view active official wordbooks"
      ON public.official_wordbooks
      FOR SELECT
      TO authenticated
      USING (is_active);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'official_wordbooks'
      AND policyname = 'Service role can manage official wordbooks'
  ) THEN
    CREATE POLICY "Service role can manage official wordbooks"
      ON public.official_wordbooks
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'official_wordbook_words'
      AND policyname = 'Authenticated users can view active official wordbook words'
  ) THEN
    CREATE POLICY "Authenticated users can view active official wordbook words"
      ON public.official_wordbook_words
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.official_wordbooks ow
          WHERE ow.id = official_wordbook_words.official_wordbook_id
            AND ow.is_active
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'official_wordbook_words'
      AND policyname = 'Service role can manage official wordbook words'
  ) THEN
    CREATE POLICY "Service role can manage official wordbook words"
      ON public.official_wordbook_words
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'update_official_wordbooks_updated_at'
        AND tgrelid = 'public.official_wordbooks'::regclass
    ) THEN
      CREATE TRIGGER update_official_wordbooks_updated_at
        BEFORE UPDATE ON public.official_wordbooks
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'update_official_wordbook_words_updated_at'
        AND tgrelid = 'public.official_wordbook_words'::regclass
    ) THEN
      CREATE TRIGGER update_official_wordbook_words_updated_at
        BEFORE UPDATE ON public.official_wordbook_words
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
