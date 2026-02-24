-- Spaced Repetition Fields for SM-2 Algorithm
-- Pro feature: Forgetting curve based review scheduling

-- Add spaced repetition columns to words table
ALTER TABLE words ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
ALTER TABLE words ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ;
ALTER TABLE words ADD COLUMN IF NOT EXISTS ease_factor FLOAT DEFAULT 2.5;
ALTER TABLE words ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 0;
ALTER TABLE words ADD COLUMN IF NOT EXISTS repetition INTEGER DEFAULT 0;

-- Index for efficient "due for review" queries
CREATE INDEX IF NOT EXISTS idx_words_next_review ON words(next_review_at);

-- Set default values for existing words
UPDATE words
SET
  ease_factor = COALESCE(ease_factor, 2.5),
  interval_days = COALESCE(interval_days, 0),
  repetition = COALESCE(repetition, 0)
WHERE ease_factor IS NULL OR interval_days IS NULL OR repetition IS NULL;
