-- Auto-grant permanent Pro to the first 66 users who register on or after 2026-04-04.
-- Overwrites handle_new_user() to add counting logic after the normal free subscription
-- and profile row creation.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_auto_pro_count INTEGER;
BEGIN
  INSERT INTO subscriptions (user_id, status, plan)
  VALUES (NEW.id, 'free', 'free');

  INSERT INTO profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Only consider users created on or after the campaign start date.
  IF NEW.created_at >= '2026-04-04T00:00:00+00:00'::timestamptz THEN
    SELECT COUNT(*)
    INTO v_auto_pro_count
    FROM public.subscriptions s
    INNER JOIN auth.users u ON u.id = s.user_id
    WHERE u.created_at >= '2026-04-04T00:00:00+00:00'::timestamptz
      AND s.plan = 'pro'
      AND s.pro_source = 'test'
      AND s.test_pro_expires_at IS NULL;

    IF v_auto_pro_count < 66 THEN
      UPDATE public.subscriptions
      SET
        status = 'active',
        plan = 'pro',
        pro_source = 'test',
        test_pro_expires_at = NULL,
        cancel_at_period_end = FALSE,
        cancel_requested_at = NULL,
        current_period_start = NOW(),
        current_period_end = NULL,
        updated_at = NOW()
      WHERE user_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;
