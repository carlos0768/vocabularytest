-- Cache AI-generated word-order quiz data for multi-word entries.
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS word_order_quiz JSONB;
