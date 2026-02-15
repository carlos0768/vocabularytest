-- Add optional project icon image
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS icon_image TEXT;
