-- Persist onboarding state on profiles so the first-run UX only appears for
-- authenticated users explicitly marked as newly signed up.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT;

UPDATE public.profiles
SET onboarding_step = 'completed'
WHERE onboarding_step IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN onboarding_step SET DEFAULT 'completed',
  ALTER COLUMN onboarding_step SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_onboarding_step_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_onboarding_step_check
      CHECK (onboarding_step IN ('signed_up', 'first_scan_done', 'completed', 'skipped'));
  END IF;
END;
$$;

-- Keep the existing auto-Pro campaign logic, but create the initial profile
-- row with the signed_up onboarding step for brand-new authenticated users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_campaign_start CONSTANT timestamptz := '2026-04-04T00:00:00+00:00'::timestamptz;
  v_auto_pro_count INTEGER;
BEGIN
  INSERT INTO public.subscriptions (user_id, status, plan)
  VALUES (NEW.id, 'free', 'free');

  INSERT INTO public.profiles (user_id, onboarding_step)
  VALUES (NEW.id, 'signed_up')
  ON CONFLICT (user_id) DO UPDATE
    SET onboarding_step = COALESCE(public.profiles.onboarding_step, EXCLUDED.onboarding_step);

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
