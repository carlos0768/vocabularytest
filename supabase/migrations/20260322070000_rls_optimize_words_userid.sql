-- ============================================
-- RLS Optimization: Add user_id to words table
-- Eliminates expensive per-row subqueries in RLS policies
-- ============================================

-- 1. Add user_id column (nullable initially for backfill)
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Backfill from projects
UPDATE public.words w
SET user_id = p.user_id
FROM public.projects p
WHERE w.project_id = p.id
  AND w.user_id IS NULL;

-- 3. Set NOT NULL after backfill
ALTER TABLE public.words
  ALTER COLUMN user_id SET NOT NULL;

-- 4. Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_words_user_id ON public.words(user_id);

-- 5. Trigger: auto-populate user_id on INSERT from parent project
CREATE OR REPLACE FUNCTION public.set_word_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id
    FROM public.projects
    WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_word_user_id ON public.words;
CREATE TRIGGER trg_set_word_user_id
  BEFORE INSERT ON public.words
  FOR EACH ROW EXECUTE FUNCTION public.set_word_user_id();

-- 6. SECURITY DEFINER function: check Pro status once per query (not per row)
CREATE OR REPLACE FUNCTION public.is_caller_active_pro()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = auth.uid()
      AND public.is_active_pro(
        s.status,
        s.plan,
        s.current_period_end,
        s.pro_source,
        s.test_pro_expires_at
      )
  );
$$;

-- 7. Drop ALL existing words RLS policies
DROP POLICY IF EXISTS "Users can view own words" ON words;
DROP POLICY IF EXISTS "Pro users can view own words" ON words;
DROP POLICY IF EXISTS "Users can create words in own projects" ON words;
DROP POLICY IF EXISTS "Users can update own words" ON words;
DROP POLICY IF EXISTS "Users can delete own words" ON words;
DROP POLICY IF EXISTS "Active Pro users can create words in own projects" ON words;
DROP POLICY IF EXISTS "Active Pro users can update own words" ON words;
DROP POLICY IF EXISTS "Active Pro users can delete own words" ON words;
DROP POLICY IF EXISTS "Anyone can view words in shared projects" ON words;
DROP POLICY IF EXISTS "Users can view words in shared projects" ON words;
DROP POLICY IF EXISTS "Pro users can view words in shared projects" ON words;

-- 8. Recreated optimized policies
-- No more projects JOIN for ownership - direct user_id check
-- No more per-row subscriptions subquery - is_caller_active_pro() cached per query

-- SELECT: Pro user can view own words
CREATE POLICY "Pro users can view own words"
  ON words FOR SELECT
  USING (user_id = auth.uid() AND public.is_caller_active_pro());

-- SELECT: Anyone can view words in shared projects (still needs projects JOIN for share_id)
CREATE POLICY "Anyone can view words in shared projects"
  ON words FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = words.project_id
        AND p.share_id IS NOT NULL
    )
  );

-- INSERT: Active Pro can create words
CREATE POLICY "Active Pro users can create words"
  ON words FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_caller_active_pro());

-- UPDATE: Active Pro can update own words
CREATE POLICY "Active Pro users can update own words"
  ON words FOR UPDATE
  USING (user_id = auth.uid() AND public.is_caller_active_pro());

-- DELETE: Active Pro can delete own words
CREATE POLICY "Active Pro users can delete own words"
  ON words FOR DELETE
  USING (user_id = auth.uid() AND public.is_caller_active_pro());
