-- Learning assets: shared registry for vocabulary projects, structure analysis,
-- and correction documents. Collections become mixed asset folders via
-- collection_items while legacy collection_projects remains for compatibility.

CREATE TABLE IF NOT EXISTS learning_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('vocabulary_project', 'structure_document', 'correction_document')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'ready', 'error')),
  legacy_project_id UUID UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_assets_user_id_created_at
  ON learning_assets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_assets_kind
  ON learning_assets (kind);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_asset_id
  ON collection_items (asset_id);

CREATE TABLE IF NOT EXISTS structure_documents (
  asset_id UUID PRIMARY KEY REFERENCES learning_assets(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('paste', 'scan')),
  cefr_target TEXT NOT NULL DEFAULT 'pre1' CHECK (cefr_target IN ('pre1')),
  parse_tree_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_analyzed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS correction_documents (
  asset_id UUID PRIMARY KEY REFERENCES learning_assets(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL CHECK (source_type IN ('paste', 'scan')),
  inline_annotations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_analyzed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS correction_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES correction_documents(asset_id) ON DELETE CASCADE,
  span_start INT NOT NULL DEFAULT 0,
  span_end INT NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('grammar', 'idiom', 'usage')),
  rule_name_ja TEXT NOT NULL,
  rule_name_en TEXT NOT NULL,
  incorrect_text TEXT NOT NULL,
  suggested_text TEXT NOT NULL,
  formal_usage_ja TEXT NOT NULL,
  example_sentence TEXT,
  example_sentence_ja TEXT,
  learner_advice TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_correction_findings_asset_id_sort_order
  ON correction_findings (asset_id, sort_order);

CREATE TABLE IF NOT EXISTS correction_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES correction_findings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'review', 'mastered')),
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  interval_days INT NOT NULL DEFAULT 0,
  repetition INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_correction_review_items_user_status
  ON correction_review_items (user_id, status);

CREATE INDEX IF NOT EXISTS idx_correction_review_items_user_next_review
  ON correction_review_items (user_id, next_review_at);

ALTER TABLE learning_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE structure_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_review_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own learning assets"
  ON learning_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own learning assets"
  ON learning_assets FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      legacy_project_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM projects
        WHERE projects.id = learning_assets.legacy_project_id
          AND projects.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own learning assets"
  ON learning_assets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own learning assets"
  ON learning_assets FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own collection items"
  ON collection_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_items.collection_id
        AND collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own collection items"
  ON collection_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_items.collection_id
        AND collections.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = collection_items.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own collection items"
  ON collection_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_items.collection_id
        AND collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own collection items"
  ON collection_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_items.collection_id
        AND collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own structure documents"
  ON structure_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = structure_documents.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own structure documents"
  ON structure_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = structure_documents.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own structure documents"
  ON structure_documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = structure_documents.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own structure documents"
  ON structure_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = structure_documents.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own correction documents"
  ON correction_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = correction_documents.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own correction documents"
  ON correction_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = correction_documents.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own correction documents"
  ON correction_documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = correction_documents.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own correction documents"
  ON correction_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = correction_documents.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own correction findings"
  ON correction_findings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = correction_findings.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own correction findings"
  ON correction_findings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = correction_findings.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own correction findings"
  ON correction_findings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = correction_findings.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own correction findings"
  ON correction_findings FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = correction_findings.asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own correction review items"
  ON correction_review_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own correction review items"
  ON correction_review_items FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM correction_findings
      JOIN learning_assets ON learning_assets.id = correction_findings.asset_id
      WHERE correction_findings.id = correction_review_items.finding_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own correction review items"
  ON correction_review_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own correction review items"
  ON correction_review_items FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON learning_assets TO authenticated;
GRANT ALL ON collection_items TO authenticated;
GRANT ALL ON structure_documents TO authenticated;
GRANT ALL ON correction_documents TO authenticated;
GRANT ALL ON correction_findings TO authenticated;
GRANT ALL ON correction_review_items TO authenticated;

DROP TRIGGER IF EXISTS update_learning_assets_updated_at ON learning_assets;
CREATE TRIGGER update_learning_assets_updated_at
  BEFORE UPDATE ON learning_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_correction_review_items_updated_at ON correction_review_items;
CREATE TRIGGER update_correction_review_items_updated_at
  BEFORE UPDATE ON correction_review_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO learning_assets (user_id, kind, title, status, legacy_project_id, created_at, updated_at)
SELECT
  projects.user_id,
  'vocabulary_project',
  projects.title,
  'ready',
  projects.id,
  projects.created_at,
  projects.updated_at
FROM projects
WHERE NOT EXISTS (
  SELECT 1
  FROM learning_assets
  WHERE learning_assets.legacy_project_id = projects.id
);

INSERT INTO collection_items (collection_id, asset_id, sort_order, added_at)
SELECT
  collection_projects.collection_id,
  learning_assets.id,
  collection_projects.sort_order,
  collection_projects.added_at
FROM collection_projects
JOIN learning_assets
  ON learning_assets.legacy_project_id = collection_projects.project_id
WHERE NOT EXISTS (
  SELECT 1
  FROM collection_items
  WHERE collection_items.collection_id = collection_projects.collection_id
    AND collection_items.asset_id = learning_assets.id
);
