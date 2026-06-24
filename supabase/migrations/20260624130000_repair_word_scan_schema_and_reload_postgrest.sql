-- Repair production schema drift from the word/sense rollout and refresh
-- PostgREST's schema cache so relationship embeds see the latest FKs.
--
-- This intentionally does not edit older migrations. It is safe to run after
-- partial manual fixes because every DDL block is idempotent.

DO $$
BEGIN
  IF to_regclass('public.scan_jobs') IS NOT NULL THEN
    ALTER TABLE public.scan_jobs
      ADD COLUMN IF NOT EXISTS scan_modes text[] NOT NULL DEFAULT ARRAY['all']::text[];

    ALTER TABLE public.scan_jobs
      ALTER COLUMN scan_modes SET DEFAULT ARRAY['all']::text[];

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'scan_jobs'
        AND column_name = 'scan_mode'
    ) THEN
      UPDATE public.scan_jobs
      SET scan_modes = CASE
        WHEN scan_mode IN ('all', 'circled', 'eiken', 'idiom') THEN ARRAY[scan_mode]::text[]
        ELSE ARRAY['all']::text[]
      END
      WHERE scan_modes IS NULL
        OR cardinality(scan_modes) = 0
        OR NOT (scan_modes <@ ARRAY['all', 'circled', 'eiken', 'idiom']::text[]);
    ELSE
      UPDATE public.scan_jobs
      SET scan_modes = ARRAY['all']::text[]
      WHERE scan_modes IS NULL
        OR cardinality(scan_modes) = 0
        OR NOT (scan_modes <@ ARRAY['all', 'circled', 'eiken', 'idiom']::text[]);
    END IF;

    ALTER TABLE public.scan_jobs
      ALTER COLUMN scan_modes SET NOT NULL;

    ALTER TABLE public.scan_jobs
      DROP CONSTRAINT IF EXISTS scan_jobs_scan_modes_valid;

    ALTER TABLE public.scan_jobs
      ADD CONSTRAINT scan_jobs_scan_modes_valid
      CHECK (
        cardinality(scan_modes) >= 1
        AND scan_modes <@ ARRAY['all', 'circled', 'eiken', 'idiom']::text[]
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.words') IS NOT NULL THEN
    ALTER TABLE public.words
      ADD COLUMN IF NOT EXISTS source_modes text[];

    UPDATE public.words
    SET source_modes = NULL
    WHERE source_modes IS NOT NULL
      AND NOT (source_modes <@ ARRAY['all', 'circled', 'eiken', 'idiom']::text[]);

    ALTER TABLE public.words
      DROP CONSTRAINT IF EXISTS words_source_modes_valid;

    ALTER TABLE public.words
      ADD CONSTRAINT words_source_modes_valid
      CHECK (
        source_modes IS NULL
        OR source_modes <@ ARRAY['all', 'circled', 'eiken', 'idiom']::text[]
      );

    ALTER TABLE public.words
      ADD COLUMN IF NOT EXISTS lexicon_sense_id uuid;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.words') IS NOT NULL
    AND to_regclass('public.lexicon_senses') IS NOT NULL
  THEN
    UPDATE public.words AS w
    SET lexicon_sense_id = NULL
    WHERE w.lexicon_sense_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.lexicon_senses AS ls
        WHERE ls.id = w.lexicon_sense_id
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.words') IS NOT NULL
    AND to_regclass('public.lexicon_senses') IS NOT NULL
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
BEGIN
  IF to_regclass('public.words') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_words_lexicon_sense_id
      ON public.words (lexicon_sense_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.word_translations') IS NOT NULL THEN
    ALTER TABLE public.word_translations
      ADD COLUMN IF NOT EXISTS lexicon_sense_id uuid;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.word_translations') IS NOT NULL
    AND to_regclass('public.lexicon_senses') IS NOT NULL
  THEN
    UPDATE public.word_translations AS wt
    SET lexicon_sense_id = NULL
    WHERE wt.lexicon_sense_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.lexicon_senses AS ls
        WHERE ls.id = wt.lexicon_sense_id
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.word_translations') IS NOT NULL
    AND to_regclass('public.words') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'word_translations_word_id_fkey'
        AND conrelid = 'public.word_translations'::regclass
    )
  THEN
    ALTER TABLE public.word_translations
      ADD CONSTRAINT word_translations_word_id_fkey
      FOREIGN KEY (word_id)
      REFERENCES public.words(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.word_translations') IS NOT NULL
    AND to_regclass('public.lexicon_senses') IS NOT NULL
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

DO $$
BEGIN
  IF to_regclass('public.word_translations') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_word_translations_lexicon_sense_id
      ON public.word_translations (lexicon_sense_id);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
