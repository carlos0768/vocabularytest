-- ============================================
-- 決着後の「もう一度対戦する」（リマッチ）
--
-- 決着画面から対戦ロビーへ戻らずに、同じ相手・同じ設定でそのまま次の対戦へ
-- 進めるようにする。リマッチ部屋は元の部屋を指す `rematch_of_room_id` を持ち、
-- そこに部分ユニーク索引を張ることで「1つの部屋に対してリマッチ部屋は1つだけ」
-- を DB 側で保証する。
--
-- これにより、両者が同時に「もう一度対戦する」を押しても、片方の INSERT が
-- 一意制約で弾かれ、弾かれた側は既にできている部屋にゲストとして入る。
-- 別々の部屋が2つできて永久にすれ違う、という事故が起きない。
-- ============================================

ALTER TABLE public.battle_rooms
  ADD COLUMN IF NOT EXISTS rematch_of_room_id UUID
    REFERENCES public.battle_rooms(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS battle_rooms_rematch_of_key
  ON public.battle_rooms (rematch_of_room_id)
  WHERE rematch_of_room_id IS NOT NULL;
