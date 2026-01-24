-- Add share functionality to projects
-- Allows users to share their wordbooks via unique URL

-- Add share_id column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE;

-- Index for efficient lookup by share_id
CREATE INDEX IF NOT EXISTS idx_projects_share_id ON projects(share_id) WHERE share_id IS NOT NULL;

-- RLS policy: Allow authenticated users to view shared projects
DROP POLICY IF EXISTS "Users can view shared projects" ON projects;
CREATE POLICY "Users can view shared projects"
  ON projects FOR SELECT
  USING (share_id IS NOT NULL AND auth.uid() IS NOT NULL);

-- RLS policy: Allow authenticated users to view words in shared projects
DROP POLICY IF EXISTS "Users can view words in shared projects" ON words;
CREATE POLICY "Users can view words in shared projects"
  ON words FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = words.project_id
      AND projects.share_id IS NOT NULL
      AND auth.uid() IS NOT NULL
    )
  );
