-- Share import log table (admin analytics only)
-- Tracks who imported which word from a shared project link.

CREATE TABLE IF NOT EXISTS share_import_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  word_id     uuid REFERENCES words(id) ON DELETE SET NULL,
  english     text NOT NULL,
  japanese    text NOT NULL,
  source_app  text,
  duplicate   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS enabled but no user-facing policies — only service_role can read/write
ALTER TABLE share_import_logs ENABLE ROW LEVEL SECURITY;

-- Index for admin queries
CREATE INDEX idx_share_import_logs_created_at ON share_import_logs (created_at DESC);
CREATE INDEX idx_share_import_logs_user_id ON share_import_logs (user_id);
