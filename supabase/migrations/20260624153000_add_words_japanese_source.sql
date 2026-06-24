-- Store whether a word's Japanese translation came from the scan image or AI.
-- Older migrations referenced this column but did not create it in every
-- production database, which breaks scan word inserts.

DO $$
BEGIN
  IF to_regclass('public.words') IS NOT NULL THEN
    ALTER TABLE public.words
      ADD COLUMN IF NOT EXISTS japanese_source text;

    UPDATE public.words
    SET japanese_source = NULL
    WHERE japanese_source IS NOT NULL
      AND japanese_source NOT IN ('scan', 'ai');

    ALTER TABLE public.words
      DROP CONSTRAINT IF EXISTS words_japanese_source_check;

    ALTER TABLE public.words
      ADD CONSTRAINT words_japanese_source_check
      CHECK (japanese_source IS NULL OR japanese_source IN ('scan', 'ai'));
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
