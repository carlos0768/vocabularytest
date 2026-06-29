-- Store official wordbook sources as normal projects.
-- projects / words / word_translations remain the single source shape; the
-- official_* columns only mark which projects should seed onboarding copies.

DROP TABLE IF EXISTS public.official_wordbook_words;
DROP TABLE IF EXISTS public.official_wordbooks;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS official_slug text NULL,
  ADD COLUMN IF NOT EXISTS official_title text NULL,
  ADD COLUMN IF NOT EXISTS official_description text NULL,
  ADD COLUMN IF NOT EXISTS official_eiken_level text NULL,
  ADD COLUMN IF NOT EXISTS official_is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS official_is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS official_sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS official_source_project_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_official_slug_format'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_official_slug_format
      CHECK (official_slug IS NULL OR official_slug ~ '^[a-z0-9][a-z0-9_-]{1,80}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_official_eiken_level_check'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_official_eiken_level_check
      CHECK (
        official_eiken_level IS NULL
        OR official_eiken_level IN ('5', '4', '3', 'pre2', '2', 'pre1', '1')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_official_title_non_empty'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_official_title_non_empty
      CHECK (official_title IS NULL OR btrim(official_title) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_official_metadata_consistent'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_official_metadata_consistent
      CHECK (
        NOT official_is_active
        OR (
          official_slug IS NOT NULL
          AND official_title IS NOT NULL
          AND official_eiken_level IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_official_slug
  ON public.projects (official_slug)
  WHERE official_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_official_level_default
  ON public.projects (official_eiken_level, official_is_default DESC, official_sort_order, created_at)
  WHERE official_is_active AND official_eiken_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_official_source_project_id
  ON public.projects (official_source_project_id)
  WHERE official_source_project_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
