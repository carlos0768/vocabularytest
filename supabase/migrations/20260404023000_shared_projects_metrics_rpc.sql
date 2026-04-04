CREATE INDEX IF NOT EXISTS idx_projects_public_share_listing
ON public.projects (created_at DESC, id DESC)
WHERE share_scope = 'public' AND share_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_shared_project_metrics(project_ids UUID[])
RETURNS TABLE (
  project_id UUID,
  word_count BIGINT,
  collaborator_count BIGINT
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
  )
  SELECT
    requested.project_id,
    COALESCE(word_counts.word_count, 0) AS word_count,
    COALESCE(collaborator_counts.collaborator_count, 1) AS collaborator_count
  FROM requested
  LEFT JOIN word_counts
    ON word_counts.project_id = requested.project_id
  LEFT JOIN collaborator_counts
    ON collaborator_counts.project_id = requested.project_id;
$$;
