-- Track spaced-repetition progress for distinct translation quiz targets.
-- The derived word memory rate stays application-computed and is not stored.

ALTER TABLE public.word_translations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'review', 'mastered')),
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS next_review_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ease_factor double precision NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS interval_days integer NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  ADD COLUMN IF NOT EXISTS repetition integer NOT NULL DEFAULT 0 CHECK (repetition >= 0);

CREATE INDEX IF NOT EXISTS idx_word_translations_next_review
  ON public.word_translations (next_review_at);
