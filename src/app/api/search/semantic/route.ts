import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateWordEmbedding } from '@/lib/embeddings';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';

const requestSchema = z.object({
  query: z.string().trim().min(1).max(120),
}).strict();

type SearchClient = Awaited<ReturnType<typeof createRouteHandlerClient>>;

type SearchDeps = {
  createClient: (request: NextRequest) => Promise<SearchClient>;
  generateEmbedding: (query: string) => Promise<number[]>;
};

const defaultDeps: SearchDeps = {
  createClient: createRouteHandlerClient,
  generateEmbedding: generateWordEmbedding,
};

export async function handleSearchSemanticPost(
  request: NextRequest,
  deps: SearchDeps = defaultDeps,
) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '検索クエリを入力してください',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { query } = parsed.data;

    const supabase = await deps.createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // Generate embedding for the search query
    const queryEmbedding = await deps.generateEmbedding(query);

    // Search using pgvector
    const { data, error } = await supabase.rpc('match_words_by_embedding', {
      query_embedding: queryEmbedding,
      user_id_filter: user.id,
      exclude_word_ids: [],
      match_threshold: 0.45,
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

export async function POST(request: NextRequest) {
  return handleSearchSemanticPost(request, defaultDeps);
}
