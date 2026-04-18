CREATE TABLE IF NOT EXISTS collection_notebook_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  wordbook_asset_id UUID NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,
  structure_asset_id UUID REFERENCES learning_assets(id) ON DELETE SET NULL,
  correction_asset_id UUID REFERENCES learning_assets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, wordbook_asset_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_notebook_bindings_structure_unique
  ON collection_notebook_bindings (collection_id, structure_asset_id)
  WHERE structure_asset_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_notebook_bindings_correction_unique
  ON collection_notebook_bindings (collection_id, correction_asset_id)
  WHERE correction_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collection_notebook_bindings_collection_wordbook
  ON collection_notebook_bindings (collection_id, wordbook_asset_id);

ALTER TABLE collection_notebook_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notebook bindings"
  ON collection_notebook_bindings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_notebook_bindings.collection_id
        AND collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own notebook bindings"
  ON collection_notebook_bindings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_notebook_bindings.collection_id
        AND collections.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = collection_notebook_bindings.wordbook_asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own notebook bindings"
  ON collection_notebook_bindings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_notebook_bindings.collection_id
        AND collections.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_notebook_bindings.collection_id
        AND collections.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM learning_assets
      WHERE learning_assets.id = collection_notebook_bindings.wordbook_asset_id
        AND learning_assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own notebook bindings"
  ON collection_notebook_bindings FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_notebook_bindings.collection_id
        AND collections.user_id = auth.uid()
    )
  );
