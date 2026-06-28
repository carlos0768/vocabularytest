-- Add 'active' to word status enum (between 'review' and 'mastered')
-- Words must now pass through 'active' before reaching 'mastered'

ALTER TABLE words DROP CONSTRAINT IF EXISTS words_status_check;
ALTER TABLE words ADD CONSTRAINT words_status_check
  CHECK (status IN ('new', 'review', 'active', 'mastered'));

-- Also update word_translations if it has a status constraint
ALTER TABLE word_translations DROP CONSTRAINT IF EXISTS word_translations_status_check;
ALTER TABLE word_translations ADD CONSTRAINT word_translations_status_check
  CHECK (status IN ('new', 'review', 'active', 'mastered'));
