-- Announcements (お知らせ): operator-authored in-app news shown to users.
--
-- Authoring happens on the /ops admin pages via the service-role client
-- (x-admin-secret gated API routes), so there are NO insert/update/delete
-- RLS policies at all — anon/authenticated roles can only read published
-- rows. The user-facing read path is a CDN-cached API route, so per-user
-- traffic never reaches this table directly.

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  -- MDSブロックJSON (src/lib/announcements/blocks.ts の announcementBlocksSchema で検証)
  body_blocks JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS announcements_published_idx
  ON announcements(published_at DESC)
  WHERE status = 'published';

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Published announcements are world-readable (the in-app viewer works for
-- logged-out visitors too). Drafts are only reachable via the service role.
CREATE POLICY "Anyone can view published announcements"
  ON announcements FOR SELECT
  USING (status = 'published');
