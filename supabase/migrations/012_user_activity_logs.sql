-- Create user_activity_logs table
CREATE TABLE user_activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    active_date date NOT NULL DEFAULT current_date,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, active_date)
);

-- Create indexes
CREATE INDEX idx_user_activity_user_id ON user_activity_logs(user_id);
CREATE INDEX idx_user_activity_user_date ON user_activity_logs(user_id, active_date);

-- Enable RLS
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert own activity" ON user_activity_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own activity" ON user_activity_logs
    FOR SELECT USING (auth.uid() = user_id);

-- RPC function to get user activity stats
CREATE OR REPLACE FUNCTION get_user_activity_stats(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_active_days integer;
    v_current_streak integer := 0;
    v_longest_streak integer := 0;
    v_last_active_date date;
    v_temp_streak integer := 0;
    v_prev_date date;
    v_current_date date;
    activity_record RECORD;
BEGIN
    -- Get total active days
    SELECT COUNT(*) INTO v_total_active_days
    FROM user_activity_logs
    WHERE user_id = p_user_id;
    
    -- Get last active date
    SELECT MAX(active_date) INTO v_last_active_date
    FROM user_activity_logs
    WHERE user_id = p_user_id;
    
    -- Calculate streaks by iterating through all activity dates in descending order
    FOR activity_record IN 
        SELECT active_date 
        FROM user_activity_logs 
        WHERE user_id = p_user_id 
        ORDER BY active_date DESC
    LOOP
        v_current_date := activity_record.active_date;
        
        IF v_prev_date IS NULL THEN
            -- First iteration
            v_temp_streak := 1;
            -- Check if current streak should start (today or yesterday)
            IF v_current_date = current_date OR v_current_date = current_date - 1 THEN
                v_current_streak := 1;
            END IF;
        ELSIF v_prev_date = v_current_date + 1 THEN
            -- Consecutive day found
            v_temp_streak := v_temp_streak + 1;
            -- Update current streak if this extends it
            IF v_current_streak > 0 THEN
                v_current_streak := v_current_streak + 1;
            END IF;
        ELSE
            -- Streak broken
            v_longest_streak := GREATEST(v_longest_streak, v_temp_streak);
            v_temp_streak := 1;
            -- Reset current streak if it was broken
            IF v_current_streak > 0 AND v_prev_date != v_current_date + 1 THEN
                v_current_streak := 0;
            END IF;
        END IF;
        
        v_prev_date := v_current_date;
    END LOOP;
    
    -- Update longest streak with the final temp streak
    v_longest_streak := GREATEST(v_longest_streak, v_temp_streak);
    
    -- Return JSON object
    RETURN json_build_object(
        'total_active_days', COALESCE(v_total_active_days, 0),
        'current_streak', COALESCE(v_current_streak, 0),
        'longest_streak', COALESCE(v_longest_streak, 0),
        'last_active_date', v_last_active_date
    );
END;
$$;
