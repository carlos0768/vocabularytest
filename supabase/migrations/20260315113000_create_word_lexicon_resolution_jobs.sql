CREATE TABLE IF NOT EXISTS public.word_lexicon_resolution_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  source text NOT NULL CHECK (source IN ('scan', 'manual')),
  word_count integer NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  processing_started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_word_lexicon_resolution_jobs_status_created_at
  ON public.word_lexicon_resolution_jobs (status, created_at);

ALTER TABLE public.word_lexicon_resolution_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'word_lexicon_resolution_jobs'
      AND policyname = 'Service role can manage word lexicon resolution jobs'
  ) THEN
    CREATE POLICY "Service role can manage word lexicon resolution jobs"
      ON public.word_lexicon_resolution_jobs
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
    WHERE tgname = 'update_word_lexicon_resolution_jobs_updated_at'
  ) THEN
    CREATE TRIGGER update_word_lexicon_resolution_jobs_updated_at
      BEFORE UPDATE ON public.word_lexicon_resolution_jobs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;
