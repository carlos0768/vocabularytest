-- Add pronunciation and etymology columns to words table
-- pronunciation: IPA notation (e.g. "/ɪˈlæb.ər.ət/")
-- etymology: AI-generated etymology text in Japanese

ALTER TABLE words ADD COLUMN IF NOT EXISTS pronunciation TEXT;
ALTER TABLE words ADD COLUMN IF NOT EXISTS etymology TEXT;
