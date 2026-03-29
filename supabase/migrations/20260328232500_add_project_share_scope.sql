ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS share_scope TEXT NOT NULL DEFAULT 'private';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_share_scope_check'
  ) THEN
    ALTER TABLE public.projects
    ADD CONSTRAINT projects_share_scope_check
    CHECK (share_scope IN ('private', 'public'));
  END IF;
END $$;
