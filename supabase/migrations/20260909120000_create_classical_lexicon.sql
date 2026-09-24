-- Shared classical-Japanese (古典語/古文単語) lexicon master.
--
-- 英語側の lexicon_entries / lexicon_senses と同じ「全ユーザー共通マスタ」構造。
-- 古典語は語彙が閉じた集合なので、いちど見出し語と訳（=画像から抽出したヒント）が
-- 入れば、以後は誰のスキャンでもその訳をそのまま流用できる。
--
-- 書き込みは service role のみ。authenticated に INSERT/UPDATE ポリシーを張ると
-- 共通辞書を誰でも汚染できてしまうので、絶対に追加しないこと。

CREATE TABLE IF NOT EXISTS public.classical_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headword text NOT NULL,
  normalized_headword text NOT NULL,
  reading text NULL,
  -- キーの片割れなので粗い品詞に留める。活用型を含めてはいけない:
  -- 同じ語を教材Aが「シク活用形容詞」、教材Bが「形容詞」と書いた場合に
  -- 別エントリへ分裂し、ヒント流用が“エラーも出さずに”効かなくなる。
  pos text NOT NULL DEFAULT 'other' CHECK (pos IN (
    'verb',
    'adjective',
    'adjectival_noun',
    'auxiliary',
    'particle',
    'noun',
    'adverb',
    'adnominal',
    'conjunction',
    'interjection',
    'other'
  )),
  -- 活用型（四段・上二段・下二段・カ変・サ変・ナ変・ラ変・ク活用・シク活用・
  -- ナリ活用・タリ活用 など）。教材ごとの表記ゆれが大きいので値のCHECKは掛けない。
  -- キーではなく表示用メタデータであり、AIの自由記述で INSERT が落ちないようにする。
  conjugation_type text NULL CHECK (
    conjugation_type IS NULL OR char_length(conjugation_type) <= 40
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_headword, pos)
);

CREATE INDEX IF NOT EXISTS idx_classical_entries_normalized_headword
  ON public.classical_entries (normalized_headword);

ALTER TABLE public.classical_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classical_entries'
      AND policyname = 'Anyone can view classical entries'
  ) THEN
    CREATE POLICY "Anyone can view classical entries"
      ON public.classical_entries
      FOR SELECT
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classical_entries'
      AND policyname = 'Service role can manage classical entries'
  ) THEN
    CREATE POLICY "Service role can manage classical entries"
      ON public.classical_entries
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_classical_entries_updated_at'
  ) THEN
    CREATE TRIGGER update_classical_entries_updated_at
      BEFORE UPDATE ON public.classical_entries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.classical_senses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classical_entry_id uuid NOT NULL REFERENCES public.classical_entries(id) ON DELETE CASCADE,
  translation_ja text NOT NULL,
  normalized_translation_ja text NOT NULL,
  meaning_rank integer NOT NULL DEFAULT 1 CHECK (meaning_rank >= 1),
  position integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  source text NULL CHECK (source IS NULL OR source IN ('scan', 'ai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (classical_entry_id, normalized_translation_ja)
);

CREATE INDEX IF NOT EXISTS idx_classical_senses_classical_entry_id
  ON public.classical_senses (classical_entry_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_classical_senses_primary_per_entry
  ON public.classical_senses (classical_entry_id)
  WHERE is_primary;

ALTER TABLE public.classical_senses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classical_senses'
      AND policyname = 'Anyone can view classical senses'
  ) THEN
    CREATE POLICY "Anyone can view classical senses"
      ON public.classical_senses
      FOR SELECT
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'classical_senses'
      AND policyname = 'Service role can manage classical senses'
  ) THEN
    CREATE POLICY "Service role can manage classical senses"
      ON public.classical_senses
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_classical_senses_updated_at'
  ) THEN
    CREATE TRIGGER update_classical_senses_updated_at
      BEFORE UPDATE ON public.classical_senses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

-- ユーザーの学習データは既存の words / word_translations のまま。
-- 見出し語は words.english、訳は word_translations に入り、この列で共通辞書を指す。
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS classical_entry_id uuid
    REFERENCES public.classical_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_words_classical_entry_id
  ON public.words (classical_entry_id);

NOTIFY pgrst, 'reload schema';
