-- Morphology (接頭語・接尾語・接中語) support:
--   - affixes: shared catalogue of affix senses (same spelling / different
--     meaning = separate rows, e.g. 'un-not' vs 'uni-one')
--   - lexicon_entries.morphology: shared per-headword AI morphology cache
--     (generated once, reused across users; {version:1, none:true} marks
--     "no affix structure" so the word is never re-sent to the AI)
--   - words.morphology: per-word snapshot shown in the app
--   - scan_jobs.include_morphology: scan option flag for the Pro job path
-- Seed data for affixes is loaded via scripts/import-affixes.ts (service
-- role), not via INSERTs here, per repository convention.

CREATE TABLE IF NOT EXISTS public.affixes (
  id text PRIMARY KEY,
  form text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('prefix', 'suffix', 'infix')),
  meaning_ja text NOT NULL,
  nuance_ja text NULL,
  connotation text NULL,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  level text NULL CHECK (level IS NULL OR level IN ('basic', 'advanced')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affixes_form_kind
  ON public.affixes (form, kind);

ALTER TABLE public.affixes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'affixes'
      AND policyname = 'Anyone can view affixes'
  ) THEN
    CREATE POLICY "Anyone can view affixes"
      ON public.affixes
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
      AND tablename = 'affixes'
      AND policyname = 'Service role can manage affixes'
  ) THEN
    CREATE POLICY "Service role can manage affixes"
      ON public.affixes
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
    WHERE tgname = 'update_affixes_updated_at'
  ) THEN
    CREATE TRIGGER update_affixes_updated_at
      BEFORE UPDATE ON public.affixes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

GRANT SELECT ON TABLE public.affixes TO anon, authenticated;

ALTER TABLE public.lexicon_entries
  ADD COLUMN IF NOT EXISTS morphology jsonb;

ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS morphology jsonb;

ALTER TABLE public.scan_jobs
  ADD COLUMN IF NOT EXISTS include_morphology boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
