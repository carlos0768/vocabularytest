-- Headword-only lexicon lookup for master-first scan resolution.
--
-- get_lexicon_entries_by_keys() matches on (normalized_headword, pos) pairs.
-- スキャン側の品詞が確定しない語（AIが partOfSpeechTags を返さなかった語は
-- 'other' に落ちる）はマスターに同じ見出し語があってもキーが一致せず、
-- 訳語・例文・発音記号・誤答選択肢をすべてAIで作り直していた。
--
-- この関数は見出し語だけで候補行を返す。どの候補を採用してよいかの品詞判定は
-- 呼び出し側（src/lib/lexicon/master-first-scan.ts）が行う：
-- 片方が 'other'（＝品詞不明）のときだけ流用し、双方が異なる品詞を明言して
-- いる場合は別語義として流用しない。

CREATE OR REPLACE FUNCTION public.get_lexicon_entries_by_headwords(p_headwords jsonb)
RETURNS TABLE (
  id uuid,
  headword text,
  normalized_headword text,
  pos text,
  cefr_level text,
  dataset_sources text[],
  primary_sense_id uuid,
  translation_ja text,
  normalized_translation_ja text,
  distinct_key text,
  meaning_summary text,
  usage_notes text,
  translation_source text,
  example_sentence text,
  example_sentence_ja text,
  pronunciation text,
  distractors jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input_headwords AS (
    SELECT DISTINCT nullif(trim(item #>> '{}'), '') AS normalized_headword
    FROM jsonb_array_elements(COALESCE(p_headwords, '[]'::jsonb)) AS item
  )
  SELECT
    ler.id,
    ler.headword,
    ler.normalized_headword,
    ler.pos,
    ler.cefr_level,
    ler.dataset_sources,
    ler.primary_sense_id,
    ler.translation_ja,
    ler.normalized_translation_ja,
    ler.distinct_key,
    ler.meaning_summary,
    ler.usage_notes,
    ler.translation_source,
    ler.example_sentence,
    ler.example_sentence_ja,
    ler.pronunciation,
    ler.distractors,
    ler.created_at,
    ler.updated_at
  FROM public.lexicon_entry_resolved_rows AS ler
  INNER JOIN input_headwords AS ih
    ON ih.normalized_headword = ler.normalized_headword
  WHERE ih.normalized_headword IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_lexicon_entries_by_headwords(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_headwords(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_headwords(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
