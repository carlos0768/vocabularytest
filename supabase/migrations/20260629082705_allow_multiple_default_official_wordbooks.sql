-- Allow one target level to seed multiple official default wordbooks.
-- The onboarding importer now imports every active default wordbook for the
-- selected Eiken level, ordered by sort_order.

DROP INDEX IF EXISTS public.idx_official_wordbooks_one_default_per_level;
