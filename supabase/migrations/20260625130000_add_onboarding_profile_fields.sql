-- Add onboarding profile fields: display_name, user_handle, eiken_level.
-- These are collected during signup BEFORE email authentication.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS user_handle TEXT,
  ADD COLUMN IF NOT EXISTS eiken_level TEXT;

-- user_handle must be unique and follow a slug-like pattern (lowercase alphanum + underscore)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_handle_unique'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_handle_unique UNIQUE (user_handle);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_handle_format'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_handle_format
      CHECK (user_handle IS NULL OR user_handle ~ '^[a-z0-9_]{3,20}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_display_name_length'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_display_name_length
      CHECK (display_name IS NULL OR (char_length(trim(display_name)) >= 1 AND char_length(trim(display_name)) <= 30));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_eiken_level_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_eiken_level_check
      CHECK (eiken_level IS NULL OR eiken_level IN ('5', '4', '3', 'pre2', '2', 'pre1', '1'));
  END IF;
END;
$$;

-- Index for handle lookups (uniqueness check during signup)
CREATE INDEX IF NOT EXISTS idx_profiles_user_handle
  ON public.profiles (user_handle)
  WHERE user_handle IS NOT NULL;
