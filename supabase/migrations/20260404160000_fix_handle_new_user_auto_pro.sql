-- Fix signup failures caused by handle_new_user() referencing auth.users during auth trigger execution.
-- Keep auto-Pro campaign behavior: first 66 signups on/after 2026-04-04 get permanent test Pro.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_campaign_start CONSTANT timestamptz := '2026-04-04T00:00:00+00:00'::timestamptz;
  v_auto_pro_count INTEGER;
BEGIN
  INSERT INTO public.subscriptions (user_id, status, plan)
  VALUES (NEW.id, 'free', 'free');

  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  IF NEW.created_at >= v_campaign_start THEN
    -- Serialize campaign grants to avoid overshooting 66 under concurrent signups.
    PERFORM pg_advisory_xact_lock(hashtextextended('auto_pro_first_66_signups_20260404', 0));

    SELECT COUNT(*)
    INTO v_auto_pro_count
    FROM public.subscriptions s
    WHERE s.created_at >= v_campaign_start
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
