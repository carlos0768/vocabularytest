-- Create scan_jobs table for background scan processing
CREATE TABLE IF NOT EXISTS scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Job configuration
  project_name TEXT NOT NULL,
  scan_mode TEXT NOT NULL DEFAULT 'all', -- all, circled, highlighted, eiken, idiom, wrong
  eiken_levels TEXT[], -- for eiken mode
  
  -- Image references (paths in Supabase Storage)
  image_paths TEXT[] NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,
  
  -- Results
  words_extracted INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Index for faster queries
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Index for finding user's pending/recent jobs
CREATE INDEX idx_scan_jobs_user_status ON scan_jobs(user_id, status);
CREATE INDEX idx_scan_jobs_status ON scan_jobs(status) WHERE status = 'pending';

-- RLS policies
ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own jobs
CREATE POLICY "Users can view own scan jobs"
  ON scan_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own jobs
CREATE POLICY "Users can create own scan jobs"
  ON scan_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only service role can update jobs (for background processing)
CREATE POLICY "Service role can update scan jobs"
  ON scan_jobs FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Users can delete their own jobs
CREATE POLICY "Users can delete own scan jobs"
  ON scan_jobs FOR DELETE
  USING (auth.uid() = user_id);
