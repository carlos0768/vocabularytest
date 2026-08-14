-- Account icon (avatar) for user profiles.
-- Stored as a compact square JPEG data URL, mirroring how project icons are
-- persisted (projects.icon_image). Keeping it in the row avoids introducing a
-- storage bucket + signed-URL lifecycle just for a small thumbnail.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Guard against oversized payloads: the client crops/compresses to a 160px JPEG
-- (~10KB, so well under 20KB base64), so 200_000 chars is a generous ceiling
-- that still keeps profile lookups (which are fetched in list views) cheap.
-- ACCOUNT_ICON_SIZE / MAX_AVATAR_DATA_URL_LENGTH in src/lib/profile/avatar.ts
-- must stay in sync with this constraint.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_url_length;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_url_length
  CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 200000);
