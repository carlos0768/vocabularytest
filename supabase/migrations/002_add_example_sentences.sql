-- Add example sentence columns to words table
-- These are used for Pro users to see example sentences

ALTER TABLE words ADD COLUMN IF NOT EXISTS example_sentence TEXT;
ALTER TABLE words ADD COLUMN IF NOT EXISTS example_sentence_ja TEXT;

-- Add spaced repetition fields
ALTER TABLE words ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
ALTER TABLE words ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ;
ALTER TABLE words ADD COLUMN IF NOT EXISTS ease_factor DECIMAL(3,2) DEFAULT 2.5;
ALTER TABLE words ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 0;
ALTER TABLE words ADD COLUMN IF NOT EXISTS repetition INTEGER DEFAULT 0;

-- Add favorite marking
ALTER TABLE words ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- Add share_id for project sharing
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE;

-- Create index for share_id lookups
CREATE INDEX IF NOT EXISTS idx_projects_share_id ON projects(share_id);

-- Allow public access to shared projects (read-only)
CREATE POLICY "Anyone can view shared projects"
  ON projects FOR SELECT
  USING (share_id IS NOT NULL);

CREATE POLICY "Anyone can view words in shared projects"
  ON words FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = words.project_id
      AND projects.share_id IS NOT NULL
    )
  );
