-- Deprecated no-op.
--
-- This migration previously marked four normal user projects as official
-- pre-1 onboarding sources. Official source content now lives in
-- public.official_wordbooks / public.official_wordbook_words instead, so this
-- timestamp is intentionally kept without mutating user-owned projects.

DO $$
BEGIN
  RAISE NOTICE 'Skipping legacy pre-1 project official seed; dedicated official_wordbooks are used.';
END
$$;

NOTIFY pgrst, 'reload schema';
