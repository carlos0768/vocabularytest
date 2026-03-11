ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS source_labels TEXT[] NOT NULL DEFAULT '{}';

UPDATE public.projects
SET source_labels = '{}'
WHERE source_labels IS NULL;
