-- 語法問題集を共有ページ (/shared) に公開できるようにする。
-- 20260723060000 で入れた share_id は「リンクを知っている人だけ」向けだったが、
-- 共有単語帳と同じように一覧から見つけられる公開状態を持たせる。
-- 公開された問題集の閲覧・一覧は service-role の API ルート経由 (単語帳の
-- shared_wordbooks と同じ発想)。RLS は本人限定のままにして変更しない。
ALTER TABLE grammar_books
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_count INTEGER NOT NULL DEFAULT 0;

-- 公開一覧は published_at の新しい順に引く。
CREATE INDEX IF NOT EXISTS idx_grammar_books_public_published
  ON grammar_books (published_at DESC)
  WHERE is_public = TRUE;

NOTIFY pgrst, 'reload schema';
