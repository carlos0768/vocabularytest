-- ============================================
-- バインダー（フォルダ）のアイコン画像
--
-- バインダーは `projects.binder` に入れた名前だけの存在で実体テーブルが無いため、
-- アイコンはここに (ユーザー, バインダー名) で持つ。画像はアカウントアイコンや
-- 単語帳アイコンと同じく 160px JPEG の data URL をそのまま入れる。
--
-- バインダー名を変えるとアイコンは付いてこない（別のバインダー扱いになる）。
-- 単語帳がすべて抜けて名前が消えた行はただの孤児で、実害が無いので消さない。
-- ============================================

CREATE TABLE IF NOT EXISTS public.binder_icons (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (user_id, name),
  CONSTRAINT binder_icons_name_length CHECK (char_length(name) BETWEEN 1 AND 40),
  -- 単語帳・グループのアイコンと同じ上限。data URL をそのまま入れるため。
  CONSTRAINT binder_icons_image_length CHECK (
    icon_image IS NULL OR char_length(icon_image) <= 200000
  )
);

ALTER TABLE public.binder_icons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "binder_icons_select_own" ON public.binder_icons;
CREATE POLICY "binder_icons_select_own"
  ON public.binder_icons
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "binder_icons_insert_own" ON public.binder_icons;
CREATE POLICY "binder_icons_insert_own"
  ON public.binder_icons
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "binder_icons_update_own" ON public.binder_icons;
CREATE POLICY "binder_icons_update_own"
  ON public.binder_icons
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "binder_icons_delete_own" ON public.binder_icons;
CREATE POLICY "binder_icons_delete_own"
  ON public.binder_icons
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_binder_icons_updated_at ON public.binder_icons;
CREATE TRIGGER update_binder_icons_updated_at
  BEFORE UPDATE ON public.binder_icons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
