-- Pro-only sharing: Both sharer and viewer must have Pro subscription
-- This replaces the previous policy that allowed any authenticated user to view shared projects

-- =========================
-- Update shared project viewing policy
-- =========================

-- Drop the previous policy that allowed any authenticated user
DROP POLICY IF EXISTS "Users can view shared projects" ON projects;

-- Pro users can view shared projects (projects where share_id is set)
-- The project owner must also be Pro (projects can only have share_id if owner is Pro)
CREATE POLICY "Pro users can view shared projects"
  ON projects FOR SELECT
  USING (
    share_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

-- =========================
-- Update shared words viewing policy
-- =========================

-- Drop the previous policy
DROP POLICY IF EXISTS "Users can view words in shared projects" ON words;

-- Pro users can view words in shared projects
CREATE POLICY "Pro users can view words in shared projects"
  ON words FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.share_id IS NOT NULL
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );
