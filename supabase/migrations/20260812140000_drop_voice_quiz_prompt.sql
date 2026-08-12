-- Drop words.voice_quiz_prompt (added in 20260812130000).
--
-- 音読チャレンジの出題文は「〜という意味の単語、英語で何と言う?」という枠と
-- 日本語訳の組み合わせでしかなく、枠の部分は単語に依存しない。そのため
-- 単語ごとにAIで生成してキャッシュする必要がなく、定型文をローテーションさせる
-- 方式へ変更した (src/lib/quiz/voice-quiz-prompt.ts)。
--
-- 列を参照するコードは残っていない (Word型・マッパー・APIルートすべて削除済み)。
-- 値が入る前に方針変更したためデータ損失もない。
ALTER TABLE public.words
  DROP COLUMN IF EXISTS voice_quiz_prompt;
