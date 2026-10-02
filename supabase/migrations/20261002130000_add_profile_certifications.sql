-- Profile certifications (資格): 英検 / TOEFL / TOEIC をプロフィールに表示する。
-- 中身の形式 (級・スコアの範囲と刻み) は src/lib/profile/certifications.ts の
-- Zod スキーマが検証する。DB 側は「配列であること」と件数の上限だけを守る。
-- MAX_PROFILE_CERTIFICATIONS とこの CHECK 制約は同じ値に保つこと。
--
-- 既存の profiles.eiken_level はオンボーディングで聞く「いまのレベル」の自己申告で、
-- 合格した級ではないため流用しない。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS certifications JSONB;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_certifications_shape;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_certifications_shape
  CHECK (
    certifications IS NULL
    OR (jsonb_typeof(certifications) = 'array' AND jsonb_array_length(certifications) <= 5)
  );
