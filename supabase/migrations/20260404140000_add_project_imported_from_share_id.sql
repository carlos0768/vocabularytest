-- Tracks projects duplicated from another user's share link (/share/[shareId]).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS imported_from_share_id TEXT NULL;

COMMENT ON COLUMN public.projects.imported_from_share_id IS
  'When set, this project was created by importing a copy from the given share_id.';
