-- Add pronunciation column to words table
-- pronunciation: IPA notation (e.g. "/ɪˈlæb.ər.ət/")

ALTER TABLE words ADD COLUMN IF NOT EXISTS pronunciation TEXT;
