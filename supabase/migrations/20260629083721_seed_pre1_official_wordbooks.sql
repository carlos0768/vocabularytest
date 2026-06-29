-- Seed the four pre-1 official wordbooks from the author's existing projects.
-- Re-running this migration logic by hand is safe: official rows are upserted
-- by slug and their copied word rows are recreated from the source projects.

WITH seed(project_id, title, slug, sort_order) AS (
  VALUES
    ('bb12e258-7731-4a06-ba31-b277bd256b03'::uuid, '英検準一級単語集1', 'eiken-pre1-default-1', 1),
    ('bed17fdf-168c-4f3f-8aff-0e612bb2d161'::uuid, '英検準一級単語集2', 'eiken-pre1-default-2', 2),
    ('59affa0b-65af-4051-a1ca-7a6f22a21ddc'::uuid, '英検準一級単語集3', 'eiken-pre1-default-3', 3),
    ('880ac7f4-0af5-4965-a45b-10bf6d3cedb7'::uuid, '英検準一級単語集4', 'eiken-pre1-default-4', 4)
),
upserted AS (
  INSERT INTO public.official_wordbooks (
    slug,
    title,
    description,
    eiken_level,
    is_default,
    is_active,
    source_labels,
    icon_image,
    sort_order
  )
  SELECT
    seed.slug,
    seed.title,
    '英検準一級向けの公式単語帳です。',
    'pre1',
    true,
    true,
    ARRAY['official', 'eiken:pre1']::text[],
    projects.icon_image,
    seed.sort_order
  FROM seed
  JOIN public.projects ON projects.id = seed.project_id
  ON CONFLICT (slug) DO UPDATE
  SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    eiken_level = EXCLUDED.eiken_level,
    is_default = EXCLUDED.is_default,
    is_active = EXCLUDED.is_active,
    source_labels = EXCLUDED.source_labels,
    icon_image = EXCLUDED.icon_image,
    sort_order = EXCLUDED.sort_order,
    updated_at = now()
  RETURNING id, slug
),
deleted_words AS (
  DELETE FROM public.official_wordbook_words words
  USING upserted
  WHERE words.official_wordbook_id = upserted.id
  RETURNING words.id
)
INSERT INTO public.official_wordbook_words (
  official_wordbook_id,
  english,
  japanese,
  translations,
  distractors,
  vocabulary_type,
  japanese_source,
  lexicon_entry_id,
  lexicon_sense_id,
  example_sentence,
  example_sentence_ja,
  pronunciation,
  part_of_speech_tags,
  related_words,
  usage_patterns,
  word_order_quiz,
  custom_sections,
  sort_order,
  created_at,
  updated_at
)
SELECT
  upserted.id,
  words.english,
  NULLIF(btrim(words.japanese), ''),
  COALESCE(
    translations.translations,
    CASE
      WHEN NULLIF(btrim(words.japanese), '') IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'translationJa', btrim(words.japanese),
        'normalizedTranslationJa', NULLIF(lower(regexp_replace(btrim(words.japanese), '\s+', ' ', 'g')), ''),
        'source', words.japanese_source,
        'lexiconSenseId', words.lexicon_sense_id,
        'meaningRank', 1
      )))
    END
  ),
  COALESCE(words.distractors, '[]'::jsonb),
  words.vocabulary_type,
  words.japanese_source,
  words.lexicon_entry_id,
  words.lexicon_sense_id,
  words.example_sentence,
  words.example_sentence_ja,
  words.pronunciation,
  CASE
    WHEN jsonb_typeof(words.part_of_speech_tags) = 'array' THEN ARRAY(
      SELECT jsonb_array_elements_text(words.part_of_speech_tags)
    )
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(words.related_words) = 'array' THEN words.related_words
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(words.usage_patterns) = 'array' THEN words.usage_patterns
    ELSE NULL
  END,
  words.word_order_quiz,
  CASE
    WHEN jsonb_typeof(words.custom_sections) = 'array' THEN words.custom_sections
    ELSE '[]'::jsonb
  END,
  (row_number() OVER (
    PARTITION BY upserted.id
    ORDER BY words.created_at, words.id
  ) - 1)::integer,
  words.created_at,
  words.updated_at
FROM seed
JOIN upserted ON upserted.slug = seed.slug
JOIN public.words ON words.project_id = seed.project_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'translationJa', word_translations.translation_ja,
      'normalizedTranslationJa', word_translations.normalized_translation_ja,
      'source', word_translations.source,
      'lexiconSenseId', word_translations.lexicon_sense_id,
      'meaningRank', word_translations.meaning_rank
    ))
    ORDER BY word_translations.position, word_translations.meaning_rank, word_translations.created_at
  ) FILTER (WHERE NULLIF(btrim(word_translations.translation_ja), '') IS NOT NULL) AS translations
  FROM public.word_translations
  WHERE word_translations.word_id = words.id
) translations ON true
ORDER BY seed.sort_order, words.created_at, words.id;

DO $$
DECLARE
  empty_wordbooks integer;
BEGIN
  SELECT count(*)
  INTO empty_wordbooks
  FROM public.official_wordbooks wordbooks
  WHERE wordbooks.slug IN (
    'eiken-pre1-default-1',
    'eiken-pre1-default-2',
    'eiken-pre1-default-3',
    'eiken-pre1-default-4'
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.official_wordbook_words words
      WHERE words.official_wordbook_id = wordbooks.id
    );

  IF empty_wordbooks > 0 THEN
    RAISE EXCEPTION 'pre1 official wordbook seed produced % empty wordbook(s)', empty_wordbooks;
  END IF;
END
$$;
