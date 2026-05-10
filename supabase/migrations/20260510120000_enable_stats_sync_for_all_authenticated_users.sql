-- ============================================================
-- Enable device-independent learning stats for all authenticated users.
--
-- 013_stats_sync.sql created the storage tables/RPCs. This migration keeps
-- that schema, but hardens the RPCs so browser clients can only sync their
-- own stats when remote stats sync is enabled for every logged-in user.
-- ============================================================

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
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'not authorized to sync stats for this user'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO user_activity_logs (user_id, active_date, quiz_count, correct_count, mastered_count)
    VALUES (p_user_id, p_date, p_quiz_count, p_correct_count, p_mastered_count)
    ON CONFLICT (user_id, active_date) DO UPDATE SET
        quiz_count = GREATEST(user_activity_logs.quiz_count, EXCLUDED.quiz_count),
        correct_count = GREATEST(user_activity_logs.correct_count, EXCLUDED.correct_count),
        mastered_count = GREATEST(user_activity_logs.mastered_count, EXCLUDED.mastered_count);
END;
$$;

CREATE OR REPLACE FUNCTION upsert_user_streak(
    p_user_id uuid,
    p_streak_count integer,
    p_last_activity_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'not authorized to sync stats for this user'
            USING ERRCODE = '42501';
    END IF;

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
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'not authorized to read stats for this user'
            USING ERRCODE = '42501';
    END IF;

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
