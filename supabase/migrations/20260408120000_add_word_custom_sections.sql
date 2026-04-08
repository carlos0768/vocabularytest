-- Add custom_sections JSONB column to words table.
-- Stores user-created sections as an ordered array: [{ id, title, content }]
ALTER TABLE public.words ADD COLUMN IF NOT EXISTS custom_sections JSONB NOT NULL DEFAULT '[]';
