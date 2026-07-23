-- 「訳を見せないと選べない」語法問題用のフラグ。
-- true のとき、演習画面で回答前から日本語訳 (sentence_ja) を表示する。
-- ChatGPT (GPT Actions) 側で、訳が無いと正解を選べない問題に true を付けて送る。
ALTER TABLE grammar_questions
  ADD COLUMN IF NOT EXISTS show_translation BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
