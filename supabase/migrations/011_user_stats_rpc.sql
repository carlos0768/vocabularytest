-- RPC function to aggregate user statistics in a single query
-- Replaces N+1 JS-side aggregation (getProjects → getWords for each → count in JS)

CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_projects', (SELECT COUNT(*) FROM projects WHERE user_id = p_user_id),
    'total_words', COUNT(w.id),
    'mastered_words', COUNT(*) FILTER (WHERE w.status = 'mastered'),
    'review_words', COUNT(*) FILTER (WHERE w.status = 'review'),
    'new_words', COUNT(*) FILTER (WHERE w.status = 'new'),
    'favorite_words', COUNT(*) FILTER (WHERE w.is_favorite = true)
  )
  FROM words w
  INNER JOIN projects p ON w.project_id = p.id
  WHERE p.user_id = p_user_id;
$$;
