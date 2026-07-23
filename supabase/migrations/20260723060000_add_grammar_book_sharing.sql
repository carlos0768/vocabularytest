-- 語法問題集の共有リンク。
-- share_id を発行した問題集は、リンクを知っているログインユーザーが
-- /grammar/share/[shareId] で閲覧し、Proユーザーは自分の問題集として
-- 取り込める。閲覧・取り込みは service-role のAPIルート経由
-- (単語帳の share_id と同じ発想。RLSは本人限定のまま変えない)。
ALTER TABLE grammar_books
  ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_grammar_books_share_id
  ON grammar_books (share_id)
  WHERE share_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
