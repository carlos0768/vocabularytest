-- Migration: Add favorite marking to words
-- This allows users to mark words as "difficult" or "important" for later review

-- Add is_favorite column to words table
ALTER TABLE words
ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for efficient querying of favorite words
CREATE INDEX idx_words_is_favorite ON words(is_favorite) WHERE is_favorite = TRUE;
