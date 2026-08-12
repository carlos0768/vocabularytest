-- Derived words (派生語) support:
--   - lexicon_entries.derived_words: shared per-headword AI cache
--     (generated once, reused across users; {version:1, items:[], none:true}
--     marks "not worth generating" so the word is never re-sent to the AI —
--     this also caches the offline filter's rejection)
--   - words.derived_words: per-word snapshot shown in the app
--   - scan_jobs.include_derived_words: scan option flag for the Pro job path
--
-- The candidate set is decided BEFORE the AI is called, by an offline filter
-- baked into src/lib/derived-words/dataset.json (see scripts/derived-words/).
-- Nothing about that filter lives in SQL — this migration only stores results.

ALTER TABLE public.lexicon_entries
  ADD COLUMN IF NOT EXISTS derived_words jsonb;

ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS derived_words jsonb;

ALTER TABLE public.scan_jobs
  ADD COLUMN IF NOT EXISTS include_derived_words boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
