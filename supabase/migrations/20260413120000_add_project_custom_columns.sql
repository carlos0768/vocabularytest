-- Add custom_columns JSONB column to projects table.
-- Stores user-defined extra columns for the word list table: [{ id, title }].
-- Cell values live in words.custom_sections keyed by the same id.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS custom_columns JSONB NOT NULL DEFAULT '[]';
