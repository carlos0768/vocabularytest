-- Pre-generated Japanese oral-quiz prompt for the voice quiz feature
-- (narrates a hint about the word without revealing its English spelling).
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS voice_quiz_prompt TEXT;
