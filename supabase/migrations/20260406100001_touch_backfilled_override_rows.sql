-- Touch updated_at for rows that had override values backfilled,
-- so deltaSync on other devices picks up the changes.
UPDATE public.words
SET updated_at = now()
WHERE (japanese_override IS NOT NULL AND BTRIM(japanese_override) != '')
   OR (english_override IS NOT NULL AND BTRIM(english_override) != '');
