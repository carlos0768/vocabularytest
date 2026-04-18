ALTER TABLE public.correction_findings
  ADD COLUMN IF NOT EXISTS difficulty INT NOT NULL DEFAULT 1
  CHECK (difficulty BETWEEN 1 AND 3);
