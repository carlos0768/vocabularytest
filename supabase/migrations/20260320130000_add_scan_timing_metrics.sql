ALTER TABLE public.scan_jobs
ADD COLUMN IF NOT EXISTS timing_metrics JSONB;
