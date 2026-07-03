-- ============================================
-- Merken Reel: word-level likes, seen tracking,
-- daily view limits, official import marker
-- ============================================

-- 1) Word-level likes for reel items.
-- A reel item is either a shared_wordbook_words row ('shared' source)
-- or a words row belonging to an official project ('official' source).
CREATE TABLE IF NOT EXISTS reel_word_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_word_id UUID NULL REFERENCES shared_wordbook_words(id) ON DELETE CASCADE,
  official_word_id UUID NULL REFERENCES words(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reel_word_likes_exactly_one_source CHECK (
    ((shared_word_id IS NOT NULL)::int + (official_word_id IS NOT NULL)::int) = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reel_word_likes_user_shared_key
  ON reel_word_likes(user_id, shared_word_id)
  WHERE shared_word_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reel_word_likes_user_official_key
  ON reel_word_likes(user_id, official_word_id)
  WHERE official_word_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reel_word_likes_shared_idx
  ON reel_word_likes(shared_word_id)
  WHERE shared_word_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reel_word_likes_official_idx
  ON reel_word_likes(official_word_id)
  WHERE official_word_id IS NOT NULL;

ALTER TABLE reel_word_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reel_word_likes_select_own ON reel_word_likes;
CREATE POLICY reel_word_likes_select_own
  ON reel_word_likes FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS reel_word_likes_insert_self ON reel_word_likes;
CREATE POLICY reel_word_likes_insert_self
  ON reel_word_likes FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS reel_word_likes_delete_own ON reel_word_likes;
CREATE POLICY reel_word_likes_delete_own
  ON reel_word_likes FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- 2) Seen tracking for feed dedup.
-- item_key format: 's:<shared_wordbook_words.id>' or 'o:<words.id>'.
-- Writes happen via service role in the feed API; no client INSERT policy.
CREATE TABLE IF NOT EXISTS reel_seen_words (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS reel_seen_words_user_seen_idx
  ON reel_seen_words(user_id, seen_at DESC);

ALTER TABLE reel_seen_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reel_seen_words_select_own ON reel_seen_words;
CREATE POLICY reel_seen_words_select_own
  ON reel_seen_words FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- 3) Daily reel view usage (mirrors daily_scan_usage).
CREATE TABLE IF NOT EXISTS daily_reel_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  view_date DATE NOT NULL DEFAULT CURRENT_DATE,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, view_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_reel_usage_user_date
  ON daily_reel_usage(user_id, view_date);

ALTER TABLE daily_reel_usage ENABLE ROW LEVEL SECURITY;

-- Users can only view their own usage; counts change only via the RPC below.
DROP POLICY IF EXISTS daily_reel_usage_select_own ON daily_reel_usage;
CREATE POLICY daily_reel_usage_select_own
  ON daily_reel_usage FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP TRIGGER IF EXISTS update_daily_reel_usage_updated_at ON daily_reel_usage;
CREATE TRIGGER update_daily_reel_usage_updated_at
  BEFORE UPDATE ON daily_reel_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Batch view-count RPC.
-- Grants up to p_requested cards against the free daily limit and
-- returns how many were actually granted.
-- Returns: { granted, current_count, limit, is_pro }
--   limit is NULL for Pro (unlimited).
-- ============================================
DROP FUNCTION IF EXISTS public.check_and_increment_reel_views(INTEGER);
CREATE OR REPLACE FUNCTION public.check_and_increment_reel_views(
  p_requested INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_pro BOOLEAN := FALSE;
  v_limit INTEGER := 50;
  v_before INTEGER;
  v_granted INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_requested IS NULL OR p_requested < 0 OR p_requested > 50 THEN
    RAISE EXCEPTION 'Invalid requested count';
  END IF;

  SELECT (status = 'active' AND plan = 'pro')
    INTO v_is_pro
  FROM subscriptions
  WHERE user_id = v_user_id;

  v_is_pro := COALESCE(v_is_pro, FALSE);
  IF v_is_pro THEN
    v_limit := NULL;
  END IF;

  -- Ensure today's row exists
  INSERT INTO daily_reel_usage (user_id, view_date, view_count)
  VALUES (v_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, view_date) DO NOTHING;

  -- Lock the row so the partial grant is computed exactly
  SELECT view_count INTO v_before
  FROM daily_reel_usage
  WHERE user_id = v_user_id AND view_date = CURRENT_DATE
  FOR UPDATE;

  IF v_limit IS NULL THEN
    v_granted := p_requested;
  ELSE
    v_granted := LEAST(p_requested, GREATEST(0, v_limit - v_before));
  END IF;

  IF v_granted > 0 THEN
    UPDATE daily_reel_usage
    SET view_count = v_before + v_granted
    WHERE user_id = v_user_id AND view_date = CURRENT_DATE;
  END IF;

  RETURN jsonb_build_object(
    'granted', v_granted,
    'current_count', v_before + v_granted,
    'limit', v_limit,
    'is_pro', v_is_pro
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_reel_views(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_reel_views(INTEGER) TO authenticated;

-- 4) Marker for wordbooks imported from official reel books
-- (mirrors projects.imported_from_share_id for shared books).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS imported_from_official_slug TEXT NULL;

COMMENT ON COLUMN public.projects.imported_from_official_slug IS
  'official_slug of the official wordbook this project was imported from (reel import). NULL when not imported from an official book.';
