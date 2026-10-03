-- 習得レベル (習得の先を無限に進める段数)。
--
-- 全部の単語が「習得」になると同じ出題が続くだけで張り合いが無いので、
-- 習得した語がクイズで正解するたびに 1 ずつ上がるレベルを持つ。
-- 習得した直後が 0 (= 従来の「習得」)、以降 Lv.1, Lv.2, … と上限なし。
-- status が 'mastered' でないときの値には意味が無い (読む側は getMasteryLevel() を通す)。
--
-- 既存行は全て 0 で埋まる (定数の DEFAULT なのでメタデータ更新のみで済む)。
ALTER TABLE words
  ADD COLUMN IF NOT EXISTS mastery_level INTEGER NOT NULL DEFAULT 0
  CHECK (mastery_level >= 0);

COMMENT ON COLUMN words.mastery_level IS
  '習得レベル。status=mastered の語がクイズで正解するたびに +1。習得直後は 0。';
