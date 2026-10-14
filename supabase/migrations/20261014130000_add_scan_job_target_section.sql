-- 既存の単語帳へスキャンで追加するとき、語を入れるセクション。
--
-- 単語帳ページ・ホームの新規作成シートでセクションを選んでからスキャンすると、
-- バックグラウンド処理 (scan-jobs/process) が保存した語の words.section_name に
-- この名前を入れる。NULL は未分類 (従来どおり)。
ALTER TABLE scan_jobs
  ADD COLUMN IF NOT EXISTS target_section_name TEXT
  CHECK (target_section_name IS NULL OR char_length(target_section_name) BETWEEN 1 AND 40);

COMMENT ON COLUMN scan_jobs.target_section_name IS
  '既存の単語帳へ追加するときの入り先セクション名。NULL は未分類。';
