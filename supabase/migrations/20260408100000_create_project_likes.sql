-- project_likes: tracks which users liked which shared projects
CREATE TABLE IF NOT EXISTS public.project_likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT project_likes_unique UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_likes_project_id_idx ON public.project_likes(project_id);
CREATE INDEX IF NOT EXISTS project_likes_user_id_idx ON public.project_likes(user_id);

ALTER TABLE public.project_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_likes_select_own
  ON public.project_likes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY project_likes_insert_self
  ON public.project_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY project_likes_delete_own
  ON public.project_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Update get_shared_project_metrics to include like_count
CREATE OR REPLACE FUNCTION public.get_shared_project_metrics(project_ids UUID[])
RETURNS TABLE (
  project_id UUID,
  word_count BIGINT,
  collaborator_count BIGINT,
  like_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH requested AS (
    SELECT UNNEST(project_ids) AS project_id
  ),
  word_counts AS (
    SELECT w.project_id, COUNT(*)::BIGINT AS word_count
    FROM public.words w
    WHERE w.project_id = ANY(project_ids)
    GROUP BY w.project_id
  ),
  collaborator_counts AS (
    SELECT pm.project_id, (COUNT(*) + 1)::BIGINT AS collaborator_count
    FROM public.project_members pm
    WHERE pm.project_id = ANY(project_ids)
    GROUP BY pm.project_id
  ),
  like_counts AS (
    SELECT pl.project_id, COUNT(*)::BIGINT AS like_count
    FROM public.project_likes pl
    WHERE pl.project_id = ANY(project_ids)
    GROUP BY pl.project_id
  )
  SELECT
    requested.project_id,
    COALESCE(word_counts.word_count, 0) AS word_count,
    COALESCE(collaborator_counts.collaborator_count, 1) AS collaborator_count,
    COALESCE(like_counts.like_count, 0) AS like_count
  FROM requested
  LEFT JOIN word_counts
    ON word_counts.project_id = requested.project_id
  LEFT JOIN collaborator_counts
    ON collaborator_counts.project_id = requested.project_id
  LEFT JOIN like_counts
    ON like_counts.project_id = requested.project_id;
$$;
