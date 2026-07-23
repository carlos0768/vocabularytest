-- 語法問題集の習得度トラッキングと保存(お気に入り)。
-- 単語帳(projects.is_favorite + words.status)に相当する機能を語法に追加する。

-- 保存(お気に入り): 単語帳の projects.is_favorite と同じ
ALTER TABLE grammar_books
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

-- 習得度: 問題ごとの本人の到達状況。共有・取り込みされる grammar_questions
-- 本体には持たせず、per-user の別テーブルに切り出す(quiz_word_misses と同様)。
CREATE TABLE IF NOT EXISTS grammar_question_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES grammar_questions(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES grammar_books(id) ON DELETE CASCADE,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  -- 直近で正解した問題を習得済みとみなす(不正解でfalseに戻す)
  mastered BOOLEAN NOT NULL DEFAULT false,
  last_answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_grammar_question_progress_user_book
  ON grammar_question_progress (user_id, book_id);

ALTER TABLE grammar_question_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grammar_question_progress_own" ON public.grammar_question_progress;
CREATE POLICY "grammar_question_progress_own"
  ON public.grammar_question_progress
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
