import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { fetchVectorSimilarWords } from '@/lib/similarity/vector-similar';

const requestSchema = z.object({
  sourceWordIds: z.array(z.string().uuid()).min(1).max(2000),
  limit: z.number().int().min(1).max(10).optional(),
}).strict();

type BatchClient = Awaited<ReturnType<typeof createRouteHandlerClient>>;

type SourceWordRow = {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
  embedding: unknown;
};

type SimilarCacheRow = {
  source_word_id: string;
  similar_word_id: string;
  rank: number;
  similarity: number;
  source: 'vector' | 'local' | string;
};

type WordRow = {
  id: string;
  english: string;
  japanese: string;
};

type SimilarItem = {
  id: string;
  english: string;
  japanese: string;
  similarity: number;
  source: 'vector' | 'local';
};

type BatchDeps = {
  createClient: (request: NextRequest) => Promise<BatchClient>;
  getAuthenticatedUserId: (client: BatchClient, request: NextRequest) => Promise<string | null>;
  getSourceWords: (client: BatchClient, sourceWordIds: string[]) => Promise<SourceWordRow[]>;
  getOwnedProjectIds: (client: BatchClient, projectIds: string[], userId: string) => Promise<Set<string>>;
  getCachedRows: (client: BatchClient, userId: string, sourceWordIds: string[]) => Promise<SimilarCacheRow[]>;
  getWordsByIds: (client: BatchClient, wordIds: string[]) => Promise<WordRow[]>;
  computeSimilarWords: (
    client: BatchClient,
    args: { userId: string; sourceWord: SourceWordRow; limit: number }
  ) => Promise<SimilarItem[]>;
  triggerSingleWordRebuild: (
    request: NextRequest,
    args: { userId: string; sourceWordId: string },
  ) => void;
};

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function normalizeCacheSource(source: unknown): 'vector' | 'local' {
  return source === 'local' ? 'local' : 'vector';
}

const defaultDeps: BatchDeps = {
  createClient: createRouteHandlerClient,
  async getAuthenticatedUserId(client, request) {
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error } = bearerToken
      ? await client.auth.getUser(bearerToken)
      : await client.auth.getUser();
    if (error || !user) return null;
    return user.id;
  },
  async getSourceWords(client, sourceWordIds) {
    const { data, error } = await client
      .from('words')
      .select('id, project_id, english, japanese, embedding')
      .in('id', sourceWordIds);

    if (error) {
      throw new Error(`Failed to load source words: ${error.message}`);
    }

    return (data || []) as SourceWordRow[];
  },
  async getOwnedProjectIds(client, projectIds, userId) {
    if (projectIds.length === 0) return new Set();

    const { data, error } = await client
      .from('projects')
      .select('id')
      .in('id', projectIds)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to verify project ownership: ${error.message}`);
    }

    return new Set((data || []).map((row: { id: string }) => row.id));
  },
  async getCachedRows(client, userId, sourceWordIds) {
    const { data, error } = await client
      .from('word_similar_cache')
      .select('source_word_id, similar_word_id, rank, similarity, source')
      .eq('user_id', userId)
      .in('source_word_id', sourceWordIds)
      .order('source_word_id', { ascending: true })
      .order('rank', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch similar cache: ${error.message}`);
    }

    return (data || []) as SimilarCacheRow[];
  },
  async getWordsByIds(client, wordIds) {
    if (wordIds.length === 0) return [];

    const { data, error } = await client
      .from('words')
      .select('id, english, japanese')
      .in('id', wordIds);

    if (error) {
      throw new Error(`Failed to fetch cached similar words: ${error.message}`);
    }

    return (data || []) as WordRow[];
  },
  async computeSimilarWords(client, args) {
    const vectorResults = await fetchVectorSimilarWords({
      supabase: client,
      userId: args.userId,
      sourceWordId: args.sourceWord.id,
      sourceEmbedding: args.sourceWord.embedding,
      threshold: 0.4,
      count: Math.max(20, args.limit),
      excludeWordIds: [args.sourceWord.id],
    });

    return vectorResults.slice(0, args.limit).map((item) => ({
      id: item.id,
      english: item.english,
      japanese: item.japanese,
      similarity: item.similarity,
      source: 'vector' as const,
    }));
  },
  triggerSingleWordRebuild(request, args) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return;

    const rebuildUrl = new URL('/api/similar-cache/rebuild', request.url);
    fetch(rebuildUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        userId: args.userId,
        mode: 'single_word',
        sourceWordId: args.sourceWordId,
      }),
    }).catch((error) => {
      console.error('Failed to trigger single-word similar cache rebuild:', error);
    });
  },
};

export async function handleQuiz2SimilarBatchPost(
  request: NextRequest,
  deps: BatchDeps = defaultDeps,
) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '無効なリクエスト形式です',
    });
    if (!parsed.ok) return parsed.response;

    const { limit = 3 } = parsed.data;
    const sourceWordIds = dedupeIds(parsed.data.sourceWordIds);
    const client = await deps.createClient(request);
    const userId = await deps.getAuthenticatedUserId(client, request);

    if (!userId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const sourceWords = await deps.getSourceWords(client, sourceWordIds);
    if (sourceWords.length !== sourceWordIds.length) {
      return NextResponse.json({ error: 'この単語にアクセスできません' }, { status: 403 });
    }

    const projectIds = dedupeIds(sourceWords.map((word) => word.project_id));
    const ownedProjectIds = await deps.getOwnedProjectIds(client, projectIds, userId);
    const ownedWords = sourceWords.filter((word) => ownedProjectIds.has(word.project_id));

    if (ownedWords.length !== sourceWordIds.length) {
      return NextResponse.json({ error: 'この単語にアクセスできません' }, { status: 403 });
    }

    const sourceWordMap = new Map(ownedWords.map((word) => [word.id, word]));
    const cachedRows = await deps.getCachedRows(client, userId, sourceWordIds);
    const cachedSimilarWordIds = dedupeIds(cachedRows.map((row) => row.similar_word_id));
    const cachedSimilarWords = await deps.getWordsByIds(client, cachedSimilarWordIds);
    const cachedSimilarWordMap = new Map(cachedSimilarWords.map((word) => [word.id, word]));

    const resultsByWordId: Record<string, SimilarItem[]> = {};
    for (const sourceWordId of sourceWordIds) {
      resultsByWordId[sourceWordId] = [];
    }

    for (const row of cachedRows) {
      const bucket = resultsByWordId[row.source_word_id];
      if (!bucket || bucket.length >= limit) continue;

      const similarWord = cachedSimilarWordMap.get(row.similar_word_id);
      if (!similarWord) continue;

      bucket.push({
        id: similarWord.id,
        english: similarWord.english,
        japanese: similarWord.japanese,
        similarity: typeof row.similarity === 'number' ? row.similarity : Number(row.similarity) || 0,
        source: normalizeCacheSource(row.source),
      });
    }

    const missingSourceIds = sourceWordIds.filter((sourceWordId) => resultsByWordId[sourceWordId].length === 0);
    if (missingSourceIds.length > 0) {
      await Promise.all(missingSourceIds.map(async (sourceWordId) => {
        const sourceWord = sourceWordMap.get(sourceWordId);
        if (!sourceWord) return;

        let fallbackResults: SimilarItem[] = [];
        try {
          fallbackResults = await deps.computeSimilarWords(client, {
            userId,
            sourceWord,
            limit,
          });
        } catch (error) {
          console.error('Failed to compute fallback similar words:', error);
        }

        resultsByWordId[sourceWordId] = fallbackResults.slice(0, limit);
        deps.triggerSingleWordRebuild(request, { userId, sourceWordId });
      }));
    }

    return NextResponse.json({ resultsByWordId });
  } catch (error) {
    console.error('Quiz2 similar batch error:', error);
    return NextResponse.json({ error: '類似語の一括取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleQuiz2SimilarBatchPost(request, defaultDeps);
}
