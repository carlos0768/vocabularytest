-- Open personal cloud sync to Free-plan users, with server-enforced abuse limits.
--
-- Background: previously only ACTIVE Pro users could read/write their own
-- projects & words in Supabase (see 005_gate_cloud_sync_to_pro.sql,
-- 20260209003000_classify_pro_source.sql, 20260322070000_rls_optimize_words_userid.sql).
-- Free users were IndexedDB-only. This migration:
--   1. Lets any authenticated user read AND write their OWN projects/words.
--   2. Keeps former-Pro (cancelled/expired) users READ-ONLY (unchanged invariant):
--      the write policies allow "active Pro OR free plan" and exclude former-Pro.
--   3. Enforces the Free-plan limit of 50 wordbooks (projects) AT THE DB LEVEL
--      so it cannot be bypassed by calling PostgREST directly. Words per
--      wordbook are NOT capped for Free users; the limit is on wordbook count.
--
-- Active Pro users remain UNLIMITED. Sharing policies (share_id based) are
-- intentionally left untouched — this migration only changes own-data access.

-- ============================================================
-- Helpers
-- ============================================================

-- True when the GIVEN user's subscription is active Pro (source-aware).
-- Used by the abuse-limit triggers, which run for an arbitrary owner user_id
-- (not necessarily auth.uid(), e.g. when a service-role job inserts rows).
CREATE OR REPLACE FUNCTION public.user_is_active_pro(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p_user_id
      AND public.is_active_pro(
        s.status, s.plan, s.current_period_end, s.pro_source, s.test_pro_expires_at
      )
  );
$$;

-- True when the CALLER may write cloud data: active Pro OR Free plan.
-- Former-Pro (plan='pro' but no longer active) is deliberately excluded so
-- cancelled/expired subscribers stay read-only, matching the app's
-- ReadonlyRemoteRepository routing.
CREATE OR REPLACE FUNCTION public.is_caller_cloud_writer()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = auth.uid()
      AND (
        s.plan = 'free'
        OR public.is_active_pro(
          s.status, s.plan, s.current_period_end, s.pro_source, s.test_pro_expires_at
        )
      )
  );
$$;

-- ============================================================
-- projects: own-data policies (sharing policies untouched)
-- ============================================================
DROP POLICY IF EXISTS "Pro users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Active Pro users can create own projects" ON projects;
DROP POLICY IF EXISTS "Active Pro users can update own projects" ON projects;
DROP POLICY IF EXISTS "Active Pro users can delete own projects" ON projects;
DROP POLICY IF EXISTS "Cloud writers can create own projects" ON projects;
DROP POLICY IF EXISTS "Cloud writers can update own projects" ON projects;
DROP POLICY IF EXISTS "Cloud writers can delete own projects" ON projects;

-- READ: any authenticated user can view their own projects (Free + Pro + former-Pro)
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (user_id = auth.uid());

-- WRITE: active Pro or Free plan (former-Pro excluded -> read-only)
CREATE POLICY "Cloud writers can create own projects"
  ON projects FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_caller_cloud_writer());

CREATE POLICY "Cloud writers can update own projects"
  ON projects FOR UPDATE
  USING (user_id = auth.uid() AND public.is_caller_cloud_writer())
  WITH CHECK (user_id = auth.uid() AND public.is_caller_cloud_writer());

CREATE POLICY "Cloud writers can delete own projects"
  ON projects FOR DELETE
  USING (user_id = auth.uid() AND public.is_caller_cloud_writer());

-- ============================================================
-- words: own-data policies (shared-project SELECT untouched)
-- Relies on the denormalized words.user_id column + trg_set_word_user_id
-- (added in 20260322070000_rls_optimize_words_userid.sql).
-- ============================================================
DROP POLICY IF EXISTS "Pro users can view own words" ON words;
DROP POLICY IF EXISTS "Users can view own words" ON words;
DROP POLICY IF EXISTS "Active Pro users can create words" ON words;
DROP POLICY IF EXISTS "Active Pro users can create words in own projects" ON words;
DROP POLICY IF EXISTS "Active Pro users can update own words" ON words;
DROP POLICY IF EXISTS "Active Pro users can delete own words" ON words;
DROP POLICY IF EXISTS "Cloud writers can create own words" ON words;
DROP POLICY IF EXISTS "Cloud writers can update own words" ON words;
DROP POLICY IF EXISTS "Cloud writers can delete own words" ON words;

-- READ: any authenticated user can view their own words
CREATE POLICY "Users can view own words"
  ON words FOR SELECT
  USING (user_id = auth.uid());

-- WRITE: active Pro or Free plan (former-Pro excluded -> read-only)
CREATE POLICY "Cloud writers can create own words"
  ON words FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_caller_cloud_writer());

CREATE POLICY "Cloud writers can update own words"
  ON words FOR UPDATE
  USING (user_id = auth.uid() AND public.is_caller_cloud_writer())
  WITH CHECK (user_id = auth.uid() AND public.is_caller_cloud_writer());

CREATE POLICY "Cloud writers can delete own words"
  ON words FOR DELETE
  USING (user_id = auth.uid() AND public.is_caller_cloud_writer());

-- ============================================================
-- Abuse prevention: Free-plan wordbook (project) cap enforced in the database.
-- The Free limit is on WORDBOOK COUNT (50), not word count — words per
-- wordbook are unlimited for Free users.
-- Statement-level AFTER trigger with a transition table => correct for
-- multi-row (batch) inserts, where a per-row BEFORE trigger could be bypassed
-- because sibling rows in the same statement are not yet visible to a COUNT().
-- Active Pro users are skipped (unlimited).
-- ============================================================

-- Drop the earlier word-count cap if a prior version of this migration created
-- it — the Free limit is now on wordbook count, not word count.
DROP TRIGGER IF EXISTS trg_enforce_free_word_limit ON words;
DROP FUNCTION IF EXISTS public.enforce_free_word_limit();

-- Free plan is limited to 50 wordbooks (matches FREE_WORDBOOK_LIMIT in src/lib/utils.ts).
CREATE OR REPLACE FUNCTION public.enforce_free_project_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  FOR v_user_id IN SELECT DISTINCT user_id FROM new_projects LOOP
    IF public.user_is_active_pro(v_user_id) THEN
      CONTINUE; -- Pro = unlimited
    END IF;

    SELECT COUNT(*) INTO v_count FROM projects WHERE user_id = v_user_id;
    IF v_count > 50 THEN
      RAISE EXCEPTION 'FREE_WORDBOOK_LIMIT_EXCEEDED: free plan is limited to 50 wordbooks'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_free_project_limit ON projects;
CREATE TRIGGER trg_enforce_free_project_limit
  AFTER INSERT ON projects
  REFERENCING NEW TABLE AS new_projects
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.enforce_free_project_limit();
