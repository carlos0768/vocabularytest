-- Migration: Add collections (project grouping)
-- Purpose: Allow users to group multiple projects (単語帳) into collections
-- Use case: "学期末試験" collection containing "パス単 p15-20" + "教科書 Unit3" projects
-- A project can belong to multiple collections (many-to-many)

-- 1. Collections table
CREATE TABLE collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Junction table (many-to-many: collections <-> projects)
CREATE TABLE collection_projects (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, project_id)
);

-- 3. Indexes
CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE INDEX idx_collection_projects_project_id ON collection_projects(project_id);

-- 4. RLS
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_projects ENABLE ROW LEVEL SECURITY;

-- Collections: users can only access their own
CREATE POLICY "Users can view own collections"
  ON collections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own collections"
  ON collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own collections"
  ON collections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own collections"
  ON collections FOR DELETE
  USING (auth.uid() = user_id);

-- Collection_projects: users can manage entries for their own collections
CREATE POLICY "Users can view own collection_projects"
  ON collection_projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_projects.collection_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert into own collections"
  ON collection_projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_projects.collection_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete from own collections"
  ON collection_projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_projects.collection_id
      AND c.user_id = auth.uid()
    )
  );

-- 5. Grant access to authenticated users
GRANT ALL ON collections TO authenticated;
GRANT ALL ON collection_projects TO authenticated;
