ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS shared_tags TEXT[] NOT NULL DEFAULT '{}';

UPDATE public.projects
SET shared_tags = '{}'
WHERE shared_tags IS NULL;

CREATE INDEX IF NOT EXISTS projects_shared_tags_gin_idx
  ON public.projects USING GIN (shared_tags);

ALTER TABLE public.study_groups
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

UPDATE public.study_groups
SET visibility = 'private'
WHERE visibility IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'study_groups_visibility_check'
      AND conrelid = 'public.study_groups'::regclass
  ) THEN
    ALTER TABLE public.study_groups
      ADD CONSTRAINT study_groups_visibility_check
      CHECK (visibility IN ('private', 'public'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS study_groups_visibility_created_at_idx
  ON public.study_groups (visibility, created_at DESC);
