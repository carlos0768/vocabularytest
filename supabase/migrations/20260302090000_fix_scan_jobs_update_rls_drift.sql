BEGIN;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can update scan jobs" ON public.scan_jobs;
DROP POLICY IF EXISTS "Users can update own scan jobs" ON public.scan_jobs;
CREATE POLICY "Service role can update scan jobs"
  ON public.scan_jobs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
COMMIT;
