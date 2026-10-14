-- 単語帳のセクション。
--
-- 1冊の単語帳を「Section 1 / Section 2 …」のように区切って一覧・ページ送りする。
-- セクションは名前で識別し、並び順と「まだ単語の無いセクション」を残すために
-- 単語帳側に名前の配列を持つ。単語側はどのセクションに入っているかを名前で持ち、
-- NULL は未分類。
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS section_names TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE words
  ADD COLUMN IF NOT EXISTS section_name TEXT
  CHECK (section_name IS NULL OR char_length(section_name) BETWEEN 1 AND 40);

COMMENT ON COLUMN projects.section_names IS
  '単語帳のセクション名 (表示順)。単語の無いセクションもここに残る。';
COMMENT ON COLUMN words.section_name IS
  '所属するセクション名 (projects.section_names のいずれか)。NULL は未分類。';
