-- Gate cloud sync features to Pro users (current or former)
--
-- Policy Design:
-- - READ: Pro plan holders (active OR cancelled) can read their own data
-- - WRITE: Only ACTIVE Pro users can create/update/delete
-- - SHARE: Disabled - no one can read other users' projects
--
-- This allows cancelled Pro users to still view their data but not modify it.

-- =========================
-- Projects policies
-- =========================
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can create own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
DROP POLICY IF EXISTS "Pro users can view own projects" ON projects;
DROP POLICY IF EXISTS "Pro users can create own projects" ON projects;
DROP POLICY IF EXISTS "Pro users can update own projects" ON projects;
DROP POLICY IF EXISTS "Pro users can delete own projects" ON projects;

-- READ: Allow Pro users (active or cancelled) to view their own projects
CREATE POLICY "Pro users can view own projects"
  ON projects FOR SELECT
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.plan = 'pro'
        -- Allow both active and cancelled (former Pro users)
    )
  );

-- WRITE: Only active Pro users can create projects
CREATE POLICY "Active Pro users can create own projects"
  ON projects FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

-- WRITE: Only active Pro users can update projects
CREATE POLICY "Active Pro users can update own projects"
  ON projects FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

-- WRITE: Only active Pro users can delete projects
CREATE POLICY "Active Pro users can delete own projects"
  ON projects FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

-- =========================
-- Words policies
-- =========================
DROP POLICY IF EXISTS "Users can view own words" ON words;
DROP POLICY IF EXISTS "Users can create words in own projects" ON words;
DROP POLICY IF EXISTS "Users can update own words" ON words;
DROP POLICY IF EXISTS "Users can delete own words" ON words;
DROP POLICY IF EXISTS "Pro users can view own words" ON words;
DROP POLICY IF EXISTS "Pro users can create words in own projects" ON words;
DROP POLICY IF EXISTS "Pro users can update own words" ON words;
DROP POLICY IF EXISTS "Pro users can delete own words" ON words;

-- READ: Allow Pro users (active or cancelled) to view their own words
CREATE POLICY "Pro users can view own words"
  ON words FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.plan = 'pro'
        -- Allow both active and cancelled (former Pro users)
    )
  );

-- WRITE: Only active Pro users can create words
CREATE POLICY "Active Pro users can create words in own projects"
  ON words FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

-- WRITE: Only active Pro users can update words
CREATE POLICY "Active Pro users can update own words"
  ON words FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

-- WRITE: Only active Pro users can delete words
CREATE POLICY "Active Pro users can delete own words"
  ON words FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.plan = 'pro'
    )
  );

-- =========================
-- NOTE: Sharing is DISABLED
-- =========================
-- The old sharing functionality relied on share_id column in projects.
-- With these policies, NO user can access another user's projects,
-- even if share_id is set. This is by design for security.
--
-- If sharing is needed in the future, add a separate policy like:
-- CREATE POLICY "Users can view shared projects"
--   ON projects FOR SELECT
--   USING (share_id IS NOT NULL AND share_id = current_setting('app.share_id', true));
