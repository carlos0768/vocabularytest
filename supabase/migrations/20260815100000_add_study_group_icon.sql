-- Group icon for study groups.
-- Stored as a compact square JPEG data URL, mirroring how account icons
-- (profiles.avatar_url) and project icons (projects.icon_image) are persisted.
-- Keeping it in the row avoids a storage bucket + signed-URL lifecycle for a
-- thumbnail that is fetched alongside every group list view.
ALTER TABLE public.study_groups
  ADD COLUMN IF NOT EXISTS icon_image TEXT;

-- Same ceiling as profiles.avatar_url: the client crops/compresses to a 160px
-- JPEG (~10KB), so 200_000 chars is generous while keeping group lists cheap.
-- ACCOUNT_ICON_SIZE / MAX_AVATAR_DATA_URL_LENGTH in src/lib/profile/avatar.ts
-- must stay in sync with this constraint.
ALTER TABLE public.study_groups
  DROP CONSTRAINT IF EXISTS study_groups_icon_image_length;
ALTER TABLE public.study_groups
  ADD CONSTRAINT study_groups_icon_image_length
  CHECK (icon_image IS NULL OR char_length(icon_image) <= 200000);
