ALTER TABLE words
  ADD COLUMN IF NOT EXISTS vocabulary_type TEXT
  CHECK (vocabulary_type IN ('active', 'passive'));
