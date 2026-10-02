-- Profile bio (自己紹介). Instagram と同じく最大150文字・改行可の自由記述。
-- 表示・保存の正規化 (改行の統一・連続空行の圧縮・前後空白の除去) は
-- src/lib/profile/bio.ts が行う。MAX_PROFILE_BIO_LENGTH とこの CHECK 制約は
-- 同じ値に保つこと (片方だけ変えると保存が DB で弾かれる)。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_length
  CHECK (bio IS NULL OR char_length(bio) <= 150);
