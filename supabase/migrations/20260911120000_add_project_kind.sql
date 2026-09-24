-- 単語帳（projects）に種別を持たせる。
--
-- 英語の単語帳と古典（古文単語）の単語帳を混ぜないためのもの。保存時に
-- 種別に合わない語を落とす判定に使う。中身から推測する方式にしなかったのは、
-- 空の単語帳の種別が決まらず「最初に入った語で決まる」という暗黙のルールに
-- なってしまうため。作成時にユーザーが選ぶ。
--
-- 既定は 'english'。既存の単語帳は圧倒的多数が英語なので、これで
-- ほぼすべてが正しい値になる。

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'english';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_kind_check'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_kind_check CHECK (kind IN ('english', 'classical'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_projects_kind
  ON public.projects (kind)
  WHERE kind <> 'english';

-- 既存単語帳のバックフィル。
-- 「古典語が1語以上あり、かつ古典語以外が1語も無い」単語帳だけを 'classical' にする。
-- 混在している単語帳は英語のまま残す。誤って古典に倒すと、以後その単語帳への
-- 英単語の追加が黙って落とされることになり、被害が大きいため。
--
-- words.classical_entry_id は 20260909120000 で追加した列。未適用の環境でも
-- このマイグレーションが落ちないよう存在確認してから実行する。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'words'
      AND column_name = 'classical_entry_id'
  ) THEN
    UPDATE public.projects p
    SET kind = 'classical'
    WHERE p.kind = 'english'
      AND EXISTS (
        SELECT 1 FROM public.words w
        WHERE w.project_id = p.id AND w.classical_entry_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.words w
        WHERE w.project_id = p.id AND w.classical_entry_id IS NULL
      );
  END IF;
END
$$;

-- バックグラウンドスキャンは scan_jobs 行しか見ないので、新規単語帳を作るときの
-- 種別をジョブ側にも持たせる。既存単語帳への追記時は使わない（保存先の種別を読む）。
ALTER TABLE public.scan_jobs
  ADD COLUMN IF NOT EXISTS project_kind text NOT NULL DEFAULT 'english';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scan_jobs_project_kind_check'
      AND conrelid = 'public.scan_jobs'::regclass
  ) THEN
    ALTER TABLE public.scan_jobs
      ADD CONSTRAINT scan_jobs_project_kind_check CHECK (project_kind IN ('english', 'classical'));
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
