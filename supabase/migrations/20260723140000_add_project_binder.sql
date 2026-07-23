-- 単語帳のバインダー (フォルダ) 整理機能。
-- projects.binder はユーザーが自由に付けるバインダー名 (NULL = 未分類)。
-- 単語帳一覧でバインダー名ごとにグループ表示する。RLSは既存の
-- projects のポリシー (本人のみ) がそのまま適用される。
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS binder TEXT
  CHECK (binder IS NULL OR char_length(binder) BETWEEN 1 AND 40);

NOTIFY pgrst, 'reload schema';
