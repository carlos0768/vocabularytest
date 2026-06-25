-- Default new accounts to private (is_public = false).
-- Existing users keep their current setting.

ALTER TABLE public.profiles
  ALTER COLUMN is_public SET DEFAULT false;
