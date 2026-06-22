ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS lexicon_sense_id uuid;

DO $$
BEGIN
  IF to_regclass('public.lexicon_senses') IS NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_words_lexicon_sense_id
  ON public.words (lexicon_sense_id);
