-- Carry the full multi-meaning list on shared wordbook snapshots.
--
-- shared_wordbook_words previously stored only the single `japanese`
-- primary-translation cache, so copying/importing a published wordbook
-- collapsed multi-meaning words down to one meaning. The new `translations`
-- JSONB column holds an ordered array of
--   { "translationJa": text, "meaningRank": int, "source": text? }
-- (primary meaning first) — the same shape the /api/words/create
-- translation schema accepts.

ALTER TABLE shared_wordbook_words
  ADD COLUMN IF NOT EXISTS translations JSONB;

-- Best-effort backfill for existing snapshots that still have a live source
-- project: match snapshot words to source words by english (the key the
-- original snapshot copy used) and aggregate their word_translations.
-- Snapshots without a resolvable source keep NULL and fall back to the
-- single `japanese` cache, which matches today's behavior. Re-publishing a
-- wordbook refreshes the snapshot with full translations either way.
WITH source_words AS (
  SELECT DISTINCT ON (w.project_id, w.english)
    w.project_id,
    w.english,
    w.id AS word_id
  FROM words w
  ORDER BY w.project_id, w.english, w.created_at ASC
),
translation_json AS (
  SELECT
    sww.id AS snapshot_word_id,
    jsonb_agg(
      jsonb_build_object('translationJa', wt.translation_ja, 'meaningRank', wt.meaning_rank)
        || CASE WHEN wt.source IS NOT NULL
             THEN jsonb_build_object('source', wt.source)
             ELSE '{}'::jsonb
           END
      ORDER BY wt.is_primary DESC, wt.meaning_rank ASC, wt.position ASC
    ) AS translations
  FROM shared_wordbook_words sww
  JOIN shared_wordbooks sb ON sb.id = sww.shared_wordbook_id
  JOIN source_words src
    ON src.project_id = sb.source_project_id
   AND src.english = sww.english
  JOIN word_translations wt ON wt.word_id = src.word_id
  GROUP BY sww.id
)
UPDATE shared_wordbook_words sww
SET translations = tj.translations
FROM translation_json tj
WHERE sww.id = tj.snapshot_word_id
  AND sww.translations IS NULL;
