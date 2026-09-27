-- 空所補充クイズ (英検大問1形式) の出題文マスター。
--
-- 中身は Tatoeba (https://tatoeba.org) の英日対訳ペア。文章をAIで作らずに済ませる
-- ための公開コーパスで、ライセンスは文ごとに CC BY 2.0 FR か CC0 1.0。
-- CC BY は投稿者名の表示が利用条件なので、作者名・ライセンス・文ID は
-- 英文・和訳それぞれについて必ず持ち、出題画面に出す。
--
-- 取り込みは scripts/import-tatoeba-cloze.ts (service role) だけが行う。
-- 全ユーザー共通のマスターなので lexicon_entries と同じく読み取り専用で公開する。

CREATE TABLE IF NOT EXISTS public.cloze_sentences (
  -- Tatoeba の英文ID。出典リンク (https://tatoeba.org/sentences/show/<id>) にも使う。
  id bigint PRIMARY KEY,
  sentence_en text NOT NULL,
  sentence_ja text NOT NULL,
  ja_sentence_id bigint NOT NULL,
  author_en text NULL,
  author_ja text NULL,
  license_en text NOT NULL CHECK (license_en IN ('CC BY 2.0 FR', 'CC0 1.0')),
  license_ja text NOT NULL CHECK (license_ja IN ('CC BY 2.0 FR', 'CC0 1.0')),
  -- 英文を小文字の語に割ったもの (src/lib/cloze/tokenize.ts と同じ規則)。
  -- 「この語 (の活用形) を含む文」を GIN で引くため。
  tokens text[] NOT NULL,
  word_count smallint NOT NULL CHECK (word_count > 0),
  source text NOT NULL DEFAULT 'tatoeba' CHECK (source IN ('tatoeba')),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cloze_sentences_tokens
  ON public.cloze_sentences USING gin (tokens);

ALTER TABLE public.cloze_sentences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cloze_sentences'
      AND policyname = 'Authenticated users can view cloze sentences'
  ) THEN
    CREATE POLICY "Authenticated users can view cloze sentences"
      ON public.cloze_sentences
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cloze_sentences'
      AND policyname = 'Service role can manage cloze sentences'
  ) THEN
    CREATE POLICY "Service role can manage cloze sentences"
      ON public.cloze_sentences
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
