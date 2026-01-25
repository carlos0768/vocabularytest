-- Add is_favorite column to projects table for bookmarking
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- Create index for faster sorting by bookmark status
CREATE INDEX IF NOT EXISTS idx_projects_is_favorite ON projects(user_id, is_favorite DESC, created_at DESC);
