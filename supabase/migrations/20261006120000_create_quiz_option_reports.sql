-- 四択の「選択肢がおかしい」報告の記録。
--
-- 学習者が報告した誤答選択肢を /api/quiz/report-option が Gemini に判定させ、
-- おかしければその場で words.distractors（と lexicon_senses.distractors）を差し替える。
-- このテーブルはその判定の記録で、誤答生成プロンプトの改善材料にする。
-- 書き込みはサーバー（service role）だけ。読むのは本人の分だけ。

CREATE TABLE IF NOT EXISTS public.quiz_option_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 単語が消えても記録は残す
  word_id UUID REFERENCES public.words(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  english TEXT NOT NULL,
  japanese TEXT NOT NULL,
  reported_option TEXT NOT NULL,
  verdict TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  -- 差し替えに使った誤答。候補が全部検査に落ちたときは NULL（報告された選択肢を外しただけ）
  replacement TEXT,
  -- words.distractors を書き換えたか
  fixed BOOLEAN NOT NULL DEFAULT false,
  -- lexicon_senses.distractors（全ユーザー共通のマスター）も書き換えたか
  lexicon_fixed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT quiz_option_reports_verdict_check
    CHECK (verdict IN ('correct_translation', 'too_similar', 'other_problem', 'ok')),
  CONSTRAINT quiz_option_reports_english_length CHECK (char_length(english) BETWEEN 1 AND 200),
  CONSTRAINT quiz_option_reports_japanese_length CHECK (char_length(japanese) BETWEEN 1 AND 300),
  CONSTRAINT quiz_option_reports_reported_option_length CHECK (char_length(reported_option) BETWEEN 1 AND 300)
);

CREATE INDEX IF NOT EXISTS quiz_option_reports_user_created_idx
  ON public.quiz_option_reports (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quiz_option_reports_word_idx
  ON public.quiz_option_reports (word_id);

ALTER TABLE public.quiz_option_reports ENABLE ROW LEVEL SECURITY;

-- 読むのは本人だけ。書き込みはサーバー（service role）だけが行うので INSERT ポリシーは張らない
DROP POLICY IF EXISTS "quiz_option_reports_select_own" ON public.quiz_option_reports;
CREATE POLICY "quiz_option_reports_select_own"
  ON public.quiz_option_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
