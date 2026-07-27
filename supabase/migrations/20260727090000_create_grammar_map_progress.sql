-- 文法マップ (26大単元/76小単元) の習得度。
--
-- マップの出題は公開ソース由来の問題バンク (src/lib/grammar/public-bank) で、
-- 問題そのものはアプリ内の定数として持つためDBには入れない。したがって
-- question_id は grammar_questions への外部キーではなく、バンクの安定ID (TEXT)。
-- ユーザー自身の語法問題集 (grammar_questions / grammar_question_progress) とは
-- 完全に分離し、マップの集計にユーザー作成の問題が混ざらないようにする。
CREATE TABLE IF NOT EXISTS grammar_map_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 公開問題バンクの問題ID (例: pg-subjunctive-if-1)
  question_id TEXT NOT NULL CHECK (char_length(question_id) BETWEEN 1 AND 80),
  -- 小単元ID (例: subjunctive-if)。ノード単位の集計を速くするため非正規化して持つ
  node_id TEXT NOT NULL CHECK (char_length(node_id) BETWEEN 1 AND 60),
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  -- 直近で正解した問題を習得済みとみなす(不正解でfalseに戻す)
  mastered BOOLEAN NOT NULL DEFAULT false,
  last_answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_grammar_map_progress_user_node
  ON grammar_map_progress (user_id, node_id);

-- RLS: 本人のみフルアクセス (grammar_question_progress と同じパターン)
ALTER TABLE grammar_map_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grammar_map_progress_own" ON public.grammar_map_progress;
CREATE POLICY "grammar_map_progress_own"
  ON public.grammar_map_progress
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
