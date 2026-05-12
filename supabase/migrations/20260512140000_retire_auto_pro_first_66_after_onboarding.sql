-- Retire the first-66 signup auto-Pro campaign after onboarding profile setup.
-- New signups receive only the default free subscription and an initial
-- signed_up profile state. Existing test Pro grants are intentionally left
-- unchanged.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, status, plan)
  VALUES (NEW.id, 'free', 'free');

  INSERT INTO public.profiles (user_id, onboarding_step)
  VALUES (NEW.id, 'signed_up')
  ON CONFLICT (user_id) DO UPDATE
    SET onboarding_step = COALESCE(public.profiles.onboarding_step, EXCLUDED.onboarding_step);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
