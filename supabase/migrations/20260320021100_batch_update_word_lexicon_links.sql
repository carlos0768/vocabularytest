-- Batch update words with lexicon links (lexicon_entry_id + part_of_speech_tags)
-- Replaces N individual UPDATE calls with a single RPC call.
--
-- Input: jsonb array of objects:
--   [{ "id": "uuid", "lexicon_entry_id": "uuid|null", "part_of_speech_tags": ["noun"] }, ...]
--
-- Only non-null fields are updated (COALESCE preserves existing values).

CREATE OR REPLACE FUNCTION batch_update_word_lexicon_links(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE words w
  SET
    lexicon_entry_id = COALESCE((u.elem->>'lexicon_entry_id')::uuid, w.lexicon_entry_id),
    part_of_speech_tags = CASE
      WHEN u.elem->'part_of_speech_tags' IS NOT NULL AND u.elem->'part_of_speech_tags' != 'null'::jsonb
        THEN u.elem->'part_of_speech_tags'
      ELSE w.part_of_speech_tags
    END
  FROM jsonb_array_elements(updates) AS u(elem)
  WHERE w.id = (u.elem->>'id')::uuid;
END;
$$;

-- Batch update lexicon_entries translations
-- Input: jsonb array of objects:
--   [{ "id": "uuid", "translation_ja": "日本語訳" }, ...]

CREATE OR REPLACE FUNCTION batch_update_lexicon_translations(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE lexicon_entries le
  SET
    translation_ja = u.elem->>'translation_ja',
    translation_source = 'ai'
  FROM jsonb_array_elements(updates) AS u(elem)
  WHERE le.id = (u.elem->>'id')::uuid;
END;
$$;
