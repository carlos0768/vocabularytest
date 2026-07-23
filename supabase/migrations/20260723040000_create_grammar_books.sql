-- 文法・語法問題集 (Vintage型: 空欄補充・英語4択・問題ごとに解説)。
-- 単語帳 (projects/words) とは意図的に別テーブルにして、フォーマットの
-- 混合を構造的に不可能にする。作成・問題生成は ChatGPT (Custom GPT) 経由
-- のみで、サーバー側でのAI生成は行わない。
CREATE TABLE IF NOT EXISTS grammar_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_books_user_updated
  ON grammar_books (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS grammar_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES grammar_books(id) ON DELETE CASCADE,
  -- RLSを単純にするため所有者を非正規化して持つ (book経由のjoin不要)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 空欄マーカー ___ を含む問題文
  sentence TEXT NOT NULL CHECK (char_length(trim(sentence)) BETWEEN 1 AND 300),
  -- 英語の選択肢4つ (JSONB配列)
  choices JSONB NOT NULL CHECK (
    jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 4
  ),
  correct_index INT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  -- Vintage風の解説 (必須)
  explanation TEXT NOT NULL CHECK (char_length(trim(explanation)) BETWEEN 1 AND 1000),
  -- 文法項目タグ (例: 仮定法, 関係代名詞, 時制)
  grammar_point TEXT CHECK (grammar_point IS NULL OR char_length(grammar_point) <= 40),
  sentence_ja TEXT CHECK (sentence_ja IS NULL OR char_length(sentence_ja) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_questions_book_created
  ON grammar_questions (book_id, created_at);

CREATE INDEX IF NOT EXISTS idx_grammar_questions_user
  ON grammar_questions (user_id);

-- updated_at 自動更新 (projects と同じ update_updated_at_column を再利用)
DROP TRIGGER IF EXISTS update_grammar_books_updated_at ON grammar_books;
CREATE TRIGGER update_grammar_books_updated_at
  BEFORE UPDATE ON grammar_books
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: 本人のみフルアクセス (Bearerスコープのclientから直接読み書きする)
ALTER TABLE grammar_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE grammar_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grammar_books_own" ON public.grammar_books;
CREATE POLICY "grammar_books_own"
  ON public.grammar_books
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "grammar_questions_own" ON public.grammar_questions;
CREATE POLICY "grammar_questions_own"
  ON public.grammar_questions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
