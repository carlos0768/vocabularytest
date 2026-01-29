import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateWordEmbedding } from '@/lib/embeddings';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: Request) {
  try {
    const { query, userId } = await request.json();

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: '検索クエリを入力してください' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // Generate embedding for the search query
    const queryEmbedding = await generateWordEmbedding(query.trim());

    // Search using pgvector
    const supabase = getAdminClient();
    const { data, error } = await supabase.rpc('match_words_by_embedding', {
      query_embedding: queryEmbedding,
      user_id_filter: userId,
      exclude_word_ids: [],
      match_threshold: 0.4,
      match_count: 20,
    });

    if (error) {
      console.error('Semantic search error:', error);
      return NextResponse.json({ error: '検索に失敗しました' }, { status: 500 });
    }

    // Fetch project titles for the results
    const projectIds = [...new Set((data || []).map((w: { project_id: string }) => w.project_id))];
    let projectMap = new Map<string, string>();

    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, title')
        .in('id', projectIds);

      if (projects) {
        projectMap = new Map(projects.map((p: { id: string; title: string }) => [p.id, p.title]));
      }
    }

    const results = (data || []).map((w: { id: string; project_id: string; english: string; japanese: string; similarity: number }) => ({
      id: w.id,
      english: w.english,
      japanese: w.japanese,
      projectId: w.project_id,
      projectTitle: projectMap.get(w.project_id) || '',
      similarity: Math.round(w.similarity * 100),
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Semantic search error:', error);
    return NextResponse.json({ error: '検索に失敗しました' }, { status: 500 });
  }
}
