-- Include example sentences in lexicon lookup RPC payload
DROP FUNCTION IF EXISTS public.get_lexicon_entries_by_keys(jsonb);

CREATE OR REPLACE FUNCTION public.get_lexicon_entries_by_keys(p_keys jsonb)
RETURNS TABLE (
  id uuid,
  headword text,
  normalized_headword text,
  pos text,
  cefr_level text,
  dataset_sources text[],
  translation_ja text,
  translation_source text,
  example_sentence text,
  example_sentence_ja text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input_keys AS (
    SELECT DISTINCT
      nullif(trim(item->>'normalized_headword'), '') AS normalized_headword,
      nullif(trim(item->>'pos'), '') AS pos
    FROM jsonb_array_elements(COALESCE(p_keys, '[]'::jsonb)) AS item
  )
  SELECT
    le.id,
    le.headword,
    le.normalized_headword,
    le.pos,
    le.cefr_level,
    le.dataset_sources,
    le.translation_ja,
    le.translation_source,
    le.example_sentence,
    le.example_sentence_ja,
    le.created_at,
    le.updated_at
  FROM public.lexicon_entries AS le
  INNER JOIN input_keys AS ik
    ON ik.normalized_headword = le.normalized_headword
   AND ik.pos = le.pos
  WHERE ik.normalized_headword IS NOT NULL
    AND ik.pos IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) TO service_role;
