-- ============================================
-- グループ内対戦は「グループに追加された単語帳」から出題する
--
-- 通常の対戦（friend / random）は出題者（ホスト）個人の単語帳から出題するが、
-- グループ内対戦の出題元は study_group_projects に共有された単語帳になった。
-- つまりグループ対戦には各プレイヤー個人の単語帳が要らないので、部屋と待機列の
-- 単語帳を NULL 許容にする。friend / random は今までどおり必ず埋まる。
-- ============================================

ALTER TABLE public.battle_rooms
  ALTER COLUMN host_project_id DROP NOT NULL;

ALTER TABLE public.battle_queue
  ALTER COLUMN project_id DROP NOT NULL;

-- グループ以外のモードは従来どおり出題者の単語帳が必須。ここを緩めたのは
-- あくまでグループ対戦のためなので、制約で意図を固定しておく。
ALTER TABLE public.battle_rooms
  DROP CONSTRAINT IF EXISTS battle_rooms_host_project_required;
ALTER TABLE public.battle_rooms
  ADD CONSTRAINT battle_rooms_host_project_required CHECK (
    mode = 'group' OR host_project_id IS NOT NULL
  );

ALTER TABLE public.battle_queue
  DROP CONSTRAINT IF EXISTS battle_queue_project_required;
ALTER TABLE public.battle_queue
  ADD CONSTRAINT battle_queue_project_required CHECK (
    group_id IS NOT NULL OR project_id IS NOT NULL
  );

COMMENT ON FUNCTION public.pair_group_battle_match(UUID, UUID, UUID, INTEGER, INTEGER, INTERVAL) IS
  'グループ内マッチメイキング。先に待っていた側がホストになり、問題数と制限時間はホストの設定を採用する。'
  '出題はホストの単語帳ではなく、グループに追加された単語帳（study_group_projects）から作るため、'
  'p_project_id は NULL でもよい。';
