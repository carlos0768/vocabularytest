import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  RESOLVED_WORD_WITH_EMBEDDING_SELECT_COLUMNS,
  resolveSelectedWordTexts,
} from '@/lib/words/resolved';

const requestSchema = z.object({
  sourceWordId: z.string().uuid(),
  limit: z.number().int().min(1).max(10).optional(),
}).strict();

type SimilarClient = Awaited<ReturnType<typeof createRouteHandlerClient>>;

type SourceWordRow = {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
  embedding: unknown;
};

type SimilarWordResult = {
  id: string;
  english: string;
  japanese: string;
  similarity: number;
};

type MatchArgs = {
  queryEmbedding: number[];
  userId: string;
  excludeWordIds: string[];
  threshold: number;
  count: number;
};

type SimilarDeps = {
  createClient: (request: NextRequest) => Promise<SimilarClient>;
  getAuthenticatedUserId: (client: SimilarClient, request: NextRequest) => Promise<string | null>;
  getSourceWord: (client: SimilarClient, sourceWordId: string) => Promise<SourceWordRow | null>;
  hasProjectOwnership: (client: SimilarClient, projectId: string, userId: string) => Promise<boolean>;
  matchSimilarWords: (client: SimilarClient, args: MatchArgs) => Promise<SimilarWordResult[]>;
};

function parseEmbedding(embedding: unknown): number[] | null {
  const sanitize = (values: unknown[]): number[] | null => {
    const numbers = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    return numbers.length > 0 ? numbers : null;
  };

  if (Array.isArray(embedding)) {
    return sanitize(embedding);
  }

  if (typeof embedding === 'string') {
    const trimmed = embedding.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return sanitize(parsed);
      }
    } catch {
      // continue with manual parsing below
    }

    const vectorValues = trimmed
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return sanitize(vectorValues);
  }

  return null;
}

const defaultDeps: SimilarDeps = {
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
  async getSourceWord(client, sourceWordId) {
    const { data, error } = await client
      .from('words')
      .select(RESOLVED_WORD_WITH_EMBEDDING_SELECT_COLUMNS)
      .eq('id', sourceWordId)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch source word:', error);
      return null;
    }

    return data ? resolveSelectedWordTexts(data as SourceWordRow) : null;
  },
  async hasProjectOwnership(client, projectId, userId) {
    const { data, error } = await client
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to verify project ownership:', error);
      return false;
    }

    return Boolean(data);
  },
  async matchSimilarWords(client, args) {
    const { data, error } = await client.rpc('match_words_by_embedding', {
      query_embedding: args.queryEmbedding,
      user_id_filter: args.userId,
      exclude_word_ids: args.excludeWordIds,
      match_threshold: args.threshold,
      match_count: args.count,
    });

    if (error) {
      throw new Error(`Vector search failed: ${error.message}`);
    }

    return (data || []).map((row: { id: string; english: string; japanese: string; similarity: number }) => ({
      id: row.id,
      english: row.english,
      japanese: row.japanese,
      similarity: row.similarity,
    }));
  },
};

export async function handleQuiz2SimilarPost(
  request: NextRequest,
  deps: SimilarDeps = defaultDeps,
) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '無効なリクエスト形式です',
    });
    if (!parsed.ok) return parsed.response;

    const { sourceWordId, limit = 3 } = parsed.data;
    const client = await deps.createClient(request);
    const userId = await deps.getAuthenticatedUserId(client, request);

    if (!userId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const sourceWord = await deps.getSourceWord(client, sourceWordId);
    if (!sourceWord) {
      return NextResponse.json({ error: '単語が見つかりません' }, { status: 404 });
    }

    const isOwner = await deps.hasProjectOwnership(client, sourceWord.project_id, userId);
    if (!isOwner) {
      return NextResponse.json({ error: 'この単語にアクセスできません' }, { status: 403 });
    }

    const embedding = parseEmbedding(sourceWord.embedding);
    if (!embedding) {
      return NextResponse.json({
        source: 'vector',
        results: [],
      });
    }

    const results = await deps.matchSimilarWords(client, {
      queryEmbedding: embedding,
      userId,
      excludeWordIds: [sourceWordId],
      threshold: 0.4,
      count: limit,
    });

    return NextResponse.json({
      source: 'vector',
      results: results.slice(0, limit),
    });
  } catch (error) {
    console.error('Quiz2 similar words error:', error);
    return NextResponse.json({ error: '類似語の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleQuiz2SimilarPost(request, defaultDeps);
}
