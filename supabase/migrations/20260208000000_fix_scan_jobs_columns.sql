-- Fix scan_jobs column names to match API code
-- The original migration used different names than what the API endpoints expect

-- Rename project_name → project_title (API uses project_title)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_jobs' AND column_name = 'project_name') THEN
    ALTER TABLE scan_jobs RENAME COLUMN project_name TO project_title;
  END IF;
END $$;

-- Rename eiken_levels → eiken_level (API uses singular, TEXT not TEXT[])
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_jobs' AND column_name = 'eiken_levels') THEN
    ALTER TABLE scan_jobs RENAME COLUMN eiken_levels TO eiken_level;
    ALTER TABLE scan_jobs ALTER COLUMN eiken_level TYPE TEXT USING (eiken_level[1]);
  END IF;
END $$;

-- Add image_path column if missing (single image backward compat)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_jobs' AND column_name = 'image_path') THEN
    ALTER TABLE scan_jobs ADD COLUMN image_path TEXT;
  END IF;
END $$;

-- Make image_paths nullable (route.ts inserts without it)
ALTER TABLE scan_jobs ALTER COLUMN image_paths DROP NOT NULL;

-- Add result column if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_jobs' AND column_name = 'result') THEN
    ALTER TABLE scan_jobs ADD COLUMN result TEXT;
  END IF;
END $$;

-- Add updated_at column if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_jobs' AND column_name = 'updated_at') THEN
    ALTER TABLE scan_jobs ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
