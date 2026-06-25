CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS shared_tags_embedding vector(1536);

CREATE INDEX IF NOT EXISTS projects_shared_tags_embedding_hnsw_idx
  ON public.projects USING hnsw (shared_tags_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION public.match_public_shared_projects_by_tag_embedding(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.2,
  match_count int DEFAULT 80
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  source_labels text[],
  shared_tags text[],
  icon_image text,
  created_at timestamptz,
  share_id text,
  is_favorite boolean,
  description text,
  share_scope text,
  similarity float
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.user_id,
    p.title,
    p.source_labels,
    p.shared_tags,
    p.icon_image,
    p.created_at,
    p.share_id,
    p.is_favorite,
    p.description,
    p.share_scope,
    1 - (p.shared_tags_embedding <=> query_embedding) AS similarity
  FROM public.projects p
  WHERE
    p.share_scope = 'public'
    AND p.share_id IS NOT NULL
    AND p.shared_tags_embedding IS NOT NULL
    AND 1 - (p.shared_tags_embedding <=> query_embedding) > match_threshold
  ORDER BY p.shared_tags_embedding <=> query_embedding ASC, p.created_at DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_public_shared_projects_by_tag_embedding TO anon, authenticated;

COMMENT ON COLUMN public.projects.shared_tags_embedding IS 'OpenAI text-embedding-3-small vector for semantic shared-tag search';
