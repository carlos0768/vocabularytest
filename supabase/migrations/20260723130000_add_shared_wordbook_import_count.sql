-- 共有単語帳のインポート数カウンタ。
-- 「人気の単語帳」ランキングをインポート数順にするために使う。
-- 加算はサーバー側 (service role) のみ:
--   /api/shared-projects/share/[shareId]/imported がインポート完了時に +1 する。
ALTER TABLE shared_wordbooks
  ADD COLUMN IF NOT EXISTS import_count INTEGER NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
