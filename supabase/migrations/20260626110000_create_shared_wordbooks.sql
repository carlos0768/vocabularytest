-- Shared wordbooks: published snapshot copies of projects for public discovery.
--
-- Previously, a "shared" wordbook referenced the owner's live project directly
-- (projects.share_scope = 'public'). This migration introduces a dedicated copy
-- table so that publishing a wordbook snapshots its words at publish time. The
-- public discovery/share/import flows read from these tables instead of the
-- owner's live project, and the owner can stop publishing or rename the shared
-- copy without affecting the original.

-- ============ Tables ============

CREATE TABLE IF NOT EXISTS shared_wordbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id TEXT NOT NULL UNIQUE,
  source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  icon_image TEXT,
  source_labels TEXT[] NOT NULL DEFAULT '{}',
  shared_tags TEXT[] NOT NULL DEFAULT '{}',
  word_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One published copy per source project (per owner). Nullable source allows a
-- copy to survive deletion of the original project.
CREATE UNIQUE INDEX IF NOT EXISTS shared_wordbooks_source_project_id_key
  ON shared_wordbooks(source_project_id)
  WHERE source_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shared_wordbooks_user_id_idx ON shared_wordbooks(user_id);
CREATE INDEX IF NOT EXISTS shared_wordbooks_created_at_idx ON shared_wordbooks(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS shared_wordbook_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_wordbook_id UUID NOT NULL REFERENCES shared_wordbooks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  english TEXT NOT NULL,
  japanese TEXT NOT NULL,
  pronunciation TEXT,
  example_sentence TEXT,
  example_sentence_ja TEXT,
  part_of_speech_tags JSONB,
  vocabulary_type TEXT,
  distractors JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shared_wordbook_words_book_idx
  ON shared_wordbook_words(shared_wordbook_id, position);

CREATE TABLE IF NOT EXISTS shared_wordbook_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_wordbook_id UUID NOT NULL REFERENCES shared_wordbooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shared_wordbook_id, user_id)
);

CREATE INDEX IF NOT EXISTS shared_wordbook_likes_book_idx
  ON shared_wordbook_likes(shared_wordbook_id);

-- ============ Row Level Security ============

ALTER TABLE shared_wordbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_wordbook_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_wordbook_likes ENABLE ROW LEVEL SECURITY;

-- shared_wordbooks: anyone may read a published copy; only the owner may write.
DROP POLICY IF EXISTS shared_wordbooks_select_public ON shared_wordbooks;
CREATE POLICY shared_wordbooks_select_public
  ON shared_wordbooks FOR SELECT
  USING (true);

DROP POLICY IF EXISTS shared_wordbooks_insert_own ON shared_wordbooks;
CREATE POLICY shared_wordbooks_insert_own
  ON shared_wordbooks FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS shared_wordbooks_update_own ON shared_wordbooks;
CREATE POLICY shared_wordbooks_update_own
  ON shared_wordbooks FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS shared_wordbooks_delete_own ON shared_wordbooks;
CREATE POLICY shared_wordbooks_delete_own
  ON shared_wordbooks FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- shared_wordbook_words: anyone may read; only the owner of the parent copy writes.
DROP POLICY IF EXISTS shared_wordbook_words_select_public ON shared_wordbook_words;
CREATE POLICY shared_wordbook_words_select_public
  ON shared_wordbook_words FOR SELECT
  USING (true);

DROP POLICY IF EXISTS shared_wordbook_words_insert_owner ON shared_wordbook_words;
CREATE POLICY shared_wordbook_words_insert_owner
  ON shared_wordbook_words FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shared_wordbooks sw
      WHERE sw.id = shared_wordbook_words.shared_wordbook_id
        AND sw.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS shared_wordbook_words_delete_owner ON shared_wordbook_words;
CREATE POLICY shared_wordbook_words_delete_owner
  ON shared_wordbook_words FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM shared_wordbooks sw
      WHERE sw.id = shared_wordbook_words.shared_wordbook_id
        AND sw.user_id = (SELECT auth.uid())
    )
  );

-- shared_wordbook_likes: user-scoped.
DROP POLICY IF EXISTS shared_wordbook_likes_select_own ON shared_wordbook_likes;
CREATE POLICY shared_wordbook_likes_select_own
  ON shared_wordbook_likes FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS shared_wordbook_likes_insert_self ON shared_wordbook_likes;
CREATE POLICY shared_wordbook_likes_insert_self
  ON shared_wordbook_likes FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS shared_wordbook_likes_delete_own ON shared_wordbook_likes;
CREATE POLICY shared_wordbook_likes_delete_own
  ON shared_wordbook_likes FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- ============ Backfill existing public projects ============

-- Snapshot every currently-public project into shared_wordbooks, reusing the
-- existing share_id so previously-shared /share/<id> links keep working.
INSERT INTO shared_wordbooks (
  share_id, source_project_id, user_id, title, description, icon_image,
  source_labels, shared_tags, word_count, like_count, created_at, updated_at
)
SELECT
  p.share_id,
  p.id,
  p.user_id,
  p.title,
  p.description,
  p.icon_image,
  COALESCE(p.source_labels, '{}'),
  COALESCE(p.shared_tags, '{}'),
  COALESCE((SELECT COUNT(*) FROM words w WHERE w.project_id = p.id), 0),
  COALESCE((SELECT COUNT(*) FROM project_likes pl WHERE pl.project_id = p.id), 0),
  p.created_at,
  NOW()
FROM projects p
WHERE p.share_scope = 'public'
  AND p.share_id IS NOT NULL
ON CONFLICT (share_id) DO NOTHING;

-- Copy the words for each backfilled snapshot.
INSERT INTO shared_wordbook_words (
  shared_wordbook_id, position, english, japanese, pronunciation,
  example_sentence, example_sentence_ja, part_of_speech_tags, vocabulary_type,
  distractors, created_at
)
SELECT
  sw.id,
  (ROW_NUMBER() OVER (PARTITION BY sw.id ORDER BY w.created_at ASC))::int,
  w.english,
  w.japanese,
  w.pronunciation,
  w.example_sentence,
  w.example_sentence_ja,
  w.part_of_speech_tags,
  w.vocabulary_type,
  COALESCE(w.distractors, '[]'::jsonb),
  w.created_at
FROM shared_wordbooks sw
JOIN projects p ON p.id = sw.source_project_id
JOIN words w ON w.project_id = p.id;
