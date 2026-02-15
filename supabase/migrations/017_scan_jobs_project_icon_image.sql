-- Store optional project icon image for background scan-created projects
ALTER TABLE scan_jobs
ADD COLUMN IF NOT EXISTS project_icon_image TEXT;
