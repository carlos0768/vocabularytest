CREATE TABLE IF NOT EXISTS public.lexicon_enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  source text NOT NULL CHECK (source IN ('scan', 'manual')),
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  processing_started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lexicon_enrichment_jobs_status_created_at
  ON public.lexicon_enrichment_jobs (status, created_at);

ALTER TABLE public.lexicon_enrichment_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lexicon_enrichment_jobs'
      AND policyname = 'Service role can manage lexicon enrichment jobs'
  ) THEN
    CREATE POLICY "Service role can manage lexicon enrichment jobs"
      ON public.lexicon_enrichment_jobs
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
    WHERE tgname = 'update_lexicon_enrichment_jobs_updated_at'
  ) THEN
    CREATE TRIGGER update_lexicon_enrichment_jobs_updated_at
      BEFORE UPDATE ON public.lexicon_enrichment_jobs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;
