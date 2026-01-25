-- Add bookmark (is_favorite) column to projects table
-- This allows users to bookmark/star their favorite projects

-- Add the column with default value
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for faster queries on bookmarked projects
CREATE INDEX IF NOT EXISTS idx_projects_is_favorite ON projects(is_favorite) WHERE is_favorite = TRUE;
