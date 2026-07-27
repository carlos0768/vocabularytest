-- ユーザ定義の抽出プロンプト（カスタム抽出モード）。
--
-- 既存の 'all' / 'circled' / 'eiken' / 'idiom' は抽出条件が固定文のため、
-- 「どの単語を抽出するか」をユーザ自身が日本語で指示できるようにする。
-- 書いたプロンプトは名前付きで保存でき、次回以降は1タップで再利用できる。
--
-- プロンプトの解決は必ずサーバー側でこのテーブルから行う（クライアントが
-- 送るのは custom_scan_mode_id か、その場限りの customPrompt のみ）。
CREATE TABLE IF NOT EXISTS custom_scan_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 抽出オプション上に出るモード名（例: 「赤ペンの単語だけ」）
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 30),
  -- 「どの単語を抽出するか」の指示文。出力フォーマット（JSON契約）は
  -- サーバー側のテンプレートが常に付与するため、ここには含めない。
  prompt TEXT NOT NULL CHECK (char_length(trim(prompt)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_scan_modes_user_updated
  ON custom_scan_modes (user_id, updated_at DESC);

-- updated_at 自動更新 (projects と同じ update_updated_at_column を再利用)
DROP TRIGGER IF EXISTS update_custom_scan_modes_updated_at ON custom_scan_modes;
CREATE TRIGGER update_custom_scan_modes_updated_at
  BEFORE UPDATE ON custom_scan_modes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 1ユーザあたりの保存上限。APIでも弾くが、PostgRESTを直接叩かれても
-- 上限を超えられないようDB側で担保する（MAX_CUSTOM_SCAN_MODES_PER_USER と対応）。
CREATE OR REPLACE FUNCTION public.enforce_custom_scan_mode_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.custom_scan_modes
  WHERE user_id = NEW.user_id;

  IF v_count >= 20 THEN
    RAISE EXCEPTION 'custom scan mode limit reached (max 20)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_custom_scan_mode_limit_trigger ON custom_scan_modes;
CREATE TRIGGER enforce_custom_scan_mode_limit_trigger
  BEFORE INSERT ON custom_scan_modes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_custom_scan_mode_limit();

-- RLS: 本人のみフルアクセス
ALTER TABLE custom_scan_modes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_scan_modes_own" ON public.custom_scan_modes;
CREATE POLICY "custom_scan_modes_own"
  ON public.custom_scan_modes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- バックグラウンドスキャン（scan_jobs）でも custom モードを使えるようにする。
-- プロンプト本文をジョブ行にコピーして持つのは、保存済みモードを後から
-- 編集・削除しても処理中ジョブの抽出条件が変わらないようにするため。
ALTER TABLE public.scan_jobs
  ADD COLUMN IF NOT EXISTS custom_prompt TEXT,
  ADD COLUMN IF NOT EXISTS custom_scan_mode_id UUID REFERENCES public.custom_scan_modes(id) ON DELETE SET NULL;

ALTER TABLE public.scan_jobs
  DROP CONSTRAINT IF EXISTS scan_jobs_custom_prompt_length;

ALTER TABLE public.scan_jobs
  ADD CONSTRAINT scan_jobs_custom_prompt_length
  CHECK (custom_prompt IS NULL OR char_length(custom_prompt) <= 1000);

-- 'custom' を有効なスキャンモードとして許可する
ALTER TABLE public.scan_jobs
  DROP CONSTRAINT IF EXISTS scan_jobs_scan_modes_valid;

ALTER TABLE public.scan_jobs
  ADD CONSTRAINT scan_jobs_scan_modes_valid
  CHECK (
    cardinality(scan_modes) >= 1
    AND scan_modes <@ ARRAY['all', 'circled', 'eiken', 'idiom', 'custom']::TEXT[]
  );

-- 抽出された単語にも sourceModes: ['custom'] が付くため、words 側も許可する
ALTER TABLE public.words
  DROP CONSTRAINT IF EXISTS words_source_modes_valid;

ALTER TABLE public.words
  ADD CONSTRAINT words_source_modes_valid
  CHECK (
    source_modes IS NULL
    OR source_modes <@ ARRAY['all', 'circled', 'eiken', 'idiom', 'custom']::TEXT[]
  );

NOTIFY pgrst, 'reload schema';
