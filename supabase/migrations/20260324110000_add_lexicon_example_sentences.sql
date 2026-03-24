-- Add example sentences to lexicon_entries master table
ALTER TABLE public.lexicon_entries
  ADD COLUMN IF NOT EXISTS example_sentence text NULL,
  ADD COLUMN IF NOT EXISTS example_sentence_ja text NULL;
