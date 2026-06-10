-- Preferred example-sentence genres for personalized AI example generation.
-- Stored as a JSONB array of short strings (max 5 genres, each 1-30 chars).

CREATE OR REPLACE FUNCTION public.is_valid_example_genres(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL OR jsonb_typeof(value) <> 'array' THEN false
    WHEN jsonb_array_length(value) > 5 THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(value) AS item
      WHERE jsonb_typeof(item) <> 'string'
        OR char_length(trim(item #>> '{}')) < 1
        OR char_length(item #>> '{}') > 30
    )
  END;
$$;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS example_genres jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_example_genres_valid'
      AND conrelid = 'public.user_preferences'::regclass
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_example_genres_valid
      CHECK (public.is_valid_example_genres(example_genres));
  END IF;
END $$;
