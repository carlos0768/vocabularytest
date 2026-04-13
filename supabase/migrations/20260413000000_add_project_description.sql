-- Add optional free-form description column to projects.
-- Displayed on the project detail page under the title.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description TEXT;
