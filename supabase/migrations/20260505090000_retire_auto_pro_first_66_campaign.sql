-- Retire the first-66 signup auto-Pro campaign.
-- New signups should only receive the default free subscription and profile row.
-- Existing test Pro grants are intentionally left unchanged.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, status, plan)
  VALUES (NEW.id, 'free', 'free');

  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
