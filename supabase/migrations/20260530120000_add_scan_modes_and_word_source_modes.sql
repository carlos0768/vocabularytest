ALTER TABLE public.scan_jobs
  ADD COLUMN IF NOT EXISTS scan_modes TEXT[] NOT NULL DEFAULT ARRAY['all']::TEXT[];

UPDATE public.scan_jobs
SET scan_modes = ARRAY[scan_mode]::TEXT[]
WHERE scan_modes IS NULL OR cardinality(scan_modes) = 0;

ALTER TABLE public.scan_jobs
  DROP CONSTRAINT IF EXISTS scan_jobs_scan_modes_valid;

ALTER TABLE public.scan_jobs
  ADD CONSTRAINT scan_jobs_scan_modes_valid
  CHECK (
    cardinality(scan_modes) >= 1
    AND scan_modes <@ ARRAY['all', 'circled', 'eiken', 'idiom']::TEXT[]
  );

ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS source_modes TEXT[];

ALTER TABLE public.words
  DROP CONSTRAINT IF EXISTS words_source_modes_valid;

ALTER TABLE public.words
  ADD CONSTRAINT words_source_modes_valid
  CHECK (
    source_modes IS NULL
    OR source_modes <@ ARRAY['all', 'circled', 'eiken', 'idiom']::TEXT[]
  );
