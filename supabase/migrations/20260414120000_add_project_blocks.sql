-- Add blocks JSONB column to projects table.
-- Stores Notion-like block layout for the project detail page:
--   [{ id, type: 'richText' | 'wordList' | 'database', position, data }]
-- When the array is empty or missing, the project detail page renders an
-- implicit wordList block (legacy behavior).
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS blocks JSONB NOT NULL DEFAULT '[]';
