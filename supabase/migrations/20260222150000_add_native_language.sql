-- Add native_language column to subscriptions table
-- Stores the user's native language for multi-language support

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS native_language TEXT DEFAULT 'ja';

-- Backfill existing users as Japanese speakers
UPDATE public.subscriptions SET native_language = 'ja' WHERE native_language IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE public.subscriptions ALTER COLUMN native_language SET NOT NULL;

-- Restrict to supported languages
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_native_language_check
  CHECK (native_language IN ('ja', 'en', 'ko', 'zh', 'ar', 'he'));
