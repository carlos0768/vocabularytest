-- 語法問題の誤答ログ (quiz_word_misses の語法版)。
-- アプリの演習画面 (/grammar/[bookId]) で不正解になるたびに1行記録し、
-- ChatGPT (GET /api/chatgpt/grammar-misses) から「間違えた問題」として
-- 誤答回数順に参照できるようにする。
CREATE TABLE IF NOT EXISTS grammar_question_misses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES grammar_questions(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES grammar_books(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_question_misses_user_created
  ON grammar_question_misses (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grammar_question_misses_user_question
  ON grammar_question_misses (user_id, question_id);

-- RLS: 本人のみ記録・参照可 (quiz_word_misses と同じパターン)
ALTER TABLE grammar_question_misses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grammar_question_misses_select_own" ON public.grammar_question_misses;
CREATE POLICY "grammar_question_misses_select_own"
  ON public.grammar_question_misses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "grammar_question_misses_insert_own" ON public.grammar_question_misses;
CREATE POLICY "grammar_question_misses_insert_own"
  ON public.grammar_question_misses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
