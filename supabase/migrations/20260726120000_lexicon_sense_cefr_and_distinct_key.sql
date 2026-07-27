-- Per-sense CEFR level + distinct meaning keys.
--
-- Goal: quiz polysemous words one meaning at a time, and drop the meanings that
-- are far below the learner's EIKEN level (a pre-1 learner should not be asked
-- "right = 右"). The quiz-target plumbing already keys off
-- lexicon_senses.distinct_key, but nothing ever wrote it, so extra meanings were
-- never testable. CEFR per sense is what makes the level filter possible:
-- lexicon_entries.cefr_level describes the headword (i.e. its most common
-- meaning), not each individual meaning.

ALTER TABLE public.lexicon_senses
  ADD COLUMN IF NOT EXISTS cefr_level text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lexicon_senses_cefr_level_check'
      AND conrelid = 'public.lexicon_senses'::regclass
  ) THEN
    ALTER TABLE public.lexicon_senses
      ADD CONSTRAINT lexicon_senses_cefr_level_check
      CHECK (cefr_level IS NULL OR cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
  END IF;
END
$$;

-- Seed the primary sense's level from the entry: the headword CEFR band that the
-- import scripts assigned describes the word's most common meaning, which is the
-- primary sense. Non-primary senses stay NULL (= unknown) until AI fills them in;
-- unknown senses are always kept by the quiz filter.
UPDATE public.lexicon_senses AS ls
SET cefr_level = upper(btrim(le.cefr_level))
FROM public.lexicon_entries AS le
WHERE le.id = ls.lexicon_entry_id
  AND ls.is_primary
  AND ls.cefr_level IS NULL
  AND upper(btrim(coalesce(le.cefr_level, ''))) IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- Backfill distinct_key for the extra meanings of multi-sense entries so they
-- become their own quiz targets. Only non-primary senses are marked: the primary
-- meaning is already tested through the word row itself, and keeping
-- distinct_key NULL there preserves `isPrimaryMeaningWord()` for free users.
WITH multi_sense_entries AS (
  SELECT lexicon_entry_id
  FROM public.lexicon_senses
  GROUP BY lexicon_entry_id
  HAVING count(*) > 1
)
UPDATE public.lexicon_senses AS ls
SET distinct_key = ls.normalized_translation_ja
FROM multi_sense_entries AS mse
WHERE ls.lexicon_entry_id = mse.lexicon_entry_id
  AND ls.distinct_key IS NULL
  AND NOT ls.is_primary;

-- Expose the sense level through the resolved view (appended so CREATE OR
-- REPLACE keeps the existing column positions).
CREATE OR REPLACE VIEW public.lexicon_entry_resolved_rows AS
SELECT
  le.id,
  le.headword,
  le.normalized_headword,
  le.pos,
  le.cefr_level,
  le.dataset_sources,
  ps.id AS primary_sense_id,
  ps.translation_ja,
  ps.normalized_translation_ja,
  ps.meaning_summary,
  ps.usage_notes,
  ps.example_sentence,
  ps.example_sentence_ja,
  ps.translation_source,
  le.created_at,
  le.updated_at,
  ps.distinct_key,
  le.pronunciation,
  ps.distractors,
  ps.cefr_level AS sense_cefr_level
FROM public.lexicon_entries AS le
LEFT JOIN LATERAL (
  SELECT
    ls.id,
    ls.translation_ja,
    ls.normalized_translation_ja,
    ls.distinct_key,
    ls.meaning_summary,
    ls.usage_notes,
    ls.example_sentence,
    ls.example_sentence_ja,
    ls.translation_source,
    ls.distractors,
    ls.cefr_level
  FROM public.lexicon_senses AS ls
  WHERE ls.lexicon_entry_id = le.id
  ORDER BY ls.is_primary DESC, ls.created_at ASC, ls.id ASC
  LIMIT 1
) AS ps ON true;

-- The return type changes, so the old function has to go first.
DROP FUNCTION IF EXISTS public.get_lexicon_entries_by_keys(jsonb);

CREATE OR REPLACE FUNCTION public.get_lexicon_entries_by_keys(p_keys jsonb)
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
  sense_cefr_level text,
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
    ler.sense_cefr_level,
    ler.created_at,
    ler.updated_at
  FROM public.lexicon_entry_resolved_rows AS ler
  INNER JOIN input_keys AS ik
    ON ik.normalized_headword = ler.normalized_headword
   AND ik.pos = ler.pos
  WHERE ik.normalized_headword IS NOT NULL
    AND ik.pos IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) TO service_role;
