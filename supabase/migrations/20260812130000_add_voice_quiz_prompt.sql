-- Pre-generated Japanese oral-quiz prompt for the voice quiz feature
-- (narrates a hint about the word without revealing its English spelling).
--
-- NOTE: この列は 20260812140000_drop_voice_quiz_prompt.sql で削除される。
-- 適用済みの環境があるため、履歴を正しく保つ目的でこのファイルを残している。
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS voice_quiz_prompt TEXT;
