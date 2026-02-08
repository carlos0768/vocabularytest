-- ============================================================
-- 013_stats_sync.sql
-- Add quiz stats columns to user_activity_logs,
-- create user_wrong_answers and user_streak tables,
-- and RPC functions for sync.
-- ============================================================

-- 1. Extend user_activity_logs with quiz stats columns
ALTER TABLE user_activity_logs
  ADD COLUMN IF NOT EXISTS quiz_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mastered_count integer NOT NULL DEFAULT 0;

-- 2. Create user_wrong_answers table
CREATE TABLE IF NOT EXISTS user_wrong_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id text NOT NULL,
    project_id text NOT NULL DEFAULT '',
    english text NOT NULL,
    japanese text NOT NULL,
    distractors text[] NOT NULL DEFAULT '{}',
    wrong_count integer NOT NULL DEFAULT 1,
    last_wrong_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_user_wrong_answers_user_id
  ON user_wrong_answers(user_id);

ALTER TABLE user_wrong_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wrong answers" ON user_wrong_answers
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wrong answers" ON user_wrong_answers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wrong answers" ON user_wrong_answers
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wrong answers" ON user_wrong_answers
    FOR DELETE USING (auth.uid() = user_id);

-- 3. Create user_streak table
CREATE TABLE IF NOT EXISTS user_streak (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    streak_count integer NOT NULL DEFAULT 0,
    last_activity_date date NOT NULL DEFAULT current_date,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_streak ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own streak" ON user_streak
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own streak" ON user_streak
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own streak" ON user_streak
    FOR UPDATE USING (auth.uid() = user_id);

-- 4. RPC: upsert_daily_stats
-- Merges daily stats using GREATEST() so the larger value wins.
CREATE OR REPLACE FUNCTION upsert_daily_stats(
    p_user_id uuid,
    p_date date,
    p_quiz_count integer,
    p_correct_count integer,
    p_mastered_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO user_activity_logs (user_id, active_date, quiz_count, correct_count, mastered_count)
    VALUES (p_user_id, p_date, p_quiz_count, p_correct_count, p_mastered_count)
    ON CONFLICT (user_id, active_date) DO UPDATE SET
        quiz_count = GREATEST(user_activity_logs.quiz_count, EXCLUDED.quiz_count),
        correct_count = GREATEST(user_activity_logs.correct_count, EXCLUDED.correct_count),
        mastered_count = GREATEST(user_activity_logs.mastered_count, EXCLUDED.mastered_count);
END;
$$;

-- 5. RPC: upsert_user_streak
-- Updates streak: picks the latest last_activity_date and its associated streak_count.
CREATE OR REPLACE FUNCTION upsert_user_streak(
    p_user_id uuid,
    p_streak_count integer,
    p_last_activity_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO user_streak (user_id, streak_count, last_activity_date, updated_at)
    VALUES (p_user_id, p_streak_count, p_last_activity_date, now())
    ON CONFLICT (user_id) DO UPDATE SET
        streak_count = CASE
            WHEN EXCLUDED.last_activity_date > user_streak.last_activity_date THEN EXCLUDED.streak_count
            WHEN EXCLUDED.last_activity_date = user_streak.last_activity_date THEN GREATEST(user_streak.streak_count, EXCLUDED.streak_count)
            ELSE user_streak.streak_count
        END,
        last_activity_date = GREATEST(user_streak.last_activity_date, EXCLUDED.last_activity_date),
        updated_at = now();
END;
$$;

-- 6. RPC: get_daily_stats_range
-- Returns daily stats for a date range (for heatmap).
CREATE OR REPLACE FUNCTION get_daily_stats_range(
    p_user_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    active_date date,
    quiz_count integer,
    correct_count integer,
    mastered_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ual.active_date,
        ual.quiz_count,
        ual.correct_count,
        ual.mastered_count
    FROM user_activity_logs ual
    WHERE ual.user_id = p_user_id
      AND ual.active_date BETWEEN p_start_date AND p_end_date
    ORDER BY ual.active_date;
END;
$$;
