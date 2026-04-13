-- Add user-editable description column to projects table.
-- Backed by the Project.description field in shared/types/index.ts.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
