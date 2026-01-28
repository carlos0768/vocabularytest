-- Restore sharing functionality for projects
-- This adds back the ability for any authenticated user to view shared projects
-- (projects with share_id set) while maintaining Pro-only write access

-- =========================
-- Restore shared project viewing
-- =========================

-- Allow any authenticated user to view projects that have a share_id set
DROP POLICY IF EXISTS "Users can view shared projects" ON projects;
CREATE POLICY "Users can view shared projects"
  ON projects FOR SELECT
  USING (share_id IS NOT NULL);

-- Allow any authenticated user to view words in shared projects
DROP POLICY IF EXISTS "Users can view words in shared projects" ON words;
CREATE POLICY "Users can view words in shared projects"
  ON words FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = words.project_id
      AND projects.share_id IS NOT NULL
    )
  );
