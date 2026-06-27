-- Track whether the followed user has seen follow/request notifications.
ALTER TABLE public.user_follows
  ADD COLUMN IF NOT EXISTS following_read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS user_follows_following_unread_idx
  ON public.user_follows (following_id, status, created_at DESC)
  WHERE following_read_at IS NULL;
