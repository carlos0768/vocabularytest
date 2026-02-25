-- Add lexical insights columns for related words and usage patterns.

ALTER TABLE words
  ADD COLUMN IF NOT EXISTS part_of_speech_tags JSONB,
  ADD COLUMN IF NOT EXISTS related_words JSONB,
  ADD COLUMN IF NOT EXISTS usage_patterns JSONB,
  ADD COLUMN IF NOT EXISTS insights_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS insights_version INTEGER DEFAULT 1;

ALTER TABLE words
  ALTER COLUMN insights_version SET DEFAULT 1;
