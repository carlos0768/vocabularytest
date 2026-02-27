-- Migration: Add favorite marking to words

ALTER TABLE words
ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_words_is_favorite ON words(is_favorite) WHERE is_favorite = TRUE;
