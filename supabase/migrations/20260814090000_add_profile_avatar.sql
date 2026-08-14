-- Account icon (avatar) for user profiles.
-- Stored as a compact square JPEG data URL, mirroring how project icons are
-- persisted (projects.icon_image). Keeping it in the row avoids introducing a
-- storage bucket + signed-URL lifecycle just for a 192px thumbnail.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Guard against oversized payloads: the client crops/compresses to ~192px JPEG
-- (well under 40KB base64), so 200_000 chars is a generous ceiling that still
-- keeps profile lookups (which are fetched in list views) cheap.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_url_length;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_url_length
  CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 200000);
