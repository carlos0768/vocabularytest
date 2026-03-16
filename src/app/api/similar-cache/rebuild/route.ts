import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  isEmbeddingsEnabled,
  SIMILAR_WORDS_DISABLED_MESSAGE,
} from '@/lib/embeddings/feature';
import {
  buildSimilarCandidatesForSource,
  collectImpactedExistingIds,
  SimilarSourceWord,
  toCacheRows,
} from '@/lib/similarity/similar-cache';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  RESOLVED_WORD_WITH_EMBEDDING_SELECT_COLUMNS,
  resolveSelectedWordTexts,
} from '@/lib/words/resolved';

const requestSchema = z.object({
  userId: z.string().uuid(),
  newWordIds: z.array(z.string().uuid()).default([]),
  mode: z.enum(['on_new_words', 'single_word']),
  sourceWordId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'on_new_words' && value.newWordIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['newWordIds'],
      message: 'newWordIds is required when mode is on_new_words',
    });
  }
  if (value.mode === 'single_word' && !value.sourceWordId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceWordId'],
      message: 'sourceWordId is required when mode is single_word',
    });
  }
});

type RebuildClient = SupabaseClient;

type UserWordRow = SimilarSourceWord & {
  project_id: string;
};

type RebuildDeps = {
  getServiceRoleToken: () => string | undefined;
  createAdminClient: () => RebuildClient;
  fetchUserWords: (client: RebuildClient, userId: string) => Promise<UserWordRow[]>;
  refreshCacheForSources: (
    client: RebuildClient,
    args: {
      userId: string;
      sourceWordIds: string[];
      allUserWords: UserWordRow[];
    },
  ) => Promise<number>;
  collectImpactedSourceIds: (
    client: RebuildClient,
    args: {
      userId: string;
      newWords: UserWordRow[];
    },
  ) => Promise<string[]>;
};

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }));

  return results;
}

const defaultDeps: RebuildDeps = {
  getServiceRoleToken() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  },
  createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    return createClient(
      url.startsWith('http') ? url : `https://${url}`,
      key,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  },
  async fetchUserWords(client, userId) {
    const { data: projects, error: projectsError } = await client
      .from('projects')
      .select('id')
      .eq('user_id', userId);

    if (projectsError) {
      throw new Error(`Failed to fetch user projects: ${projectsError.message}`);
    }

    const projectIds = dedupeIds((projects || []).map((project: { id: string }) => project.id));
    if (projectIds.length === 0) return [];

    const { data: words, error: wordsError } = await client
      .from('words')
      .select(RESOLVED_WORD_WITH_EMBEDDING_SELECT_COLUMNS)
      .in('project_id', projectIds);

    if (wordsError) {
      throw new Error(`Failed to fetch user words: ${wordsError.message}`);
    }

    return ((words || []) as UserWordRow[]).map((word) => resolveSelectedWordTexts(word));
  },
  async refreshCacheForSources(client, args) {
    const sourceWordIds = dedupeIds(args.sourceWordIds);
    if (sourceWordIds.length === 0) return 0;

    const sourceWordMap = new Map(args.allUserWords.map((word) => [word.id, word]));
    const allWordsForLocal = args.allUserWords.map((word) => ({
      id: word.id,
      english: word.english,
      japanese: word.japanese,
    }));

    const rowSets = await mapWithConcurrency(sourceWordIds, 4, async (sourceWordId) => {
      const sourceWord = sourceWordMap.get(sourceWordId);
      if (!sourceWord) return [];

      const candidates = await buildSimilarCandidatesForSource({
        supabase: client,
        userId: args.userId,
        sourceWord,
        allUserWords: allWordsForLocal,
        limit: 3,
        vectorThreshold: 0.4,
        vectorCount: 20,
      });

      return toCacheRows({
        userId: args.userId,
        sourceWordId,
        candidates,
      });
    });

    const flattenedRows = rowSets.flat();
    const { error: deleteError } = await client
      .from('word_similar_cache')
      .delete()
      .eq('user_id', args.userId)
      .in('source_word_id', sourceWordIds);

    if (deleteError) {
      throw new Error(`Failed to clear similar cache rows: ${deleteError.message}`);
    }

    if (flattenedRows.length > 0) {
      const { error: insertError } = await client
        .from('word_similar_cache')
        .insert(flattenedRows);

      if (insertError) {
        throw new Error(`Failed to insert similar cache rows: ${insertError.message}`);
      }
    }

    return sourceWordIds.length;
  },
  async collectImpactedSourceIds(client, args) {
    return collectImpactedExistingIds({
      supabase: client,
      userId: args.userId,
      newWords: args.newWords,
      threshold: 0.55,
      count: 30,
      maxImpacted: 300,
    });
  },
};

export async function handleSimilarCacheRebuildPost(
  request: NextRequest,
  deps: RebuildDeps = defaultDeps,
) {
  try {
    const expectedToken = deps.getServiceRoleToken();
    if (!expectedToken) {
      return NextResponse.json({ error: 'Service role key is not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '無効なリクエスト形式です',
    });
    if (!parsed.ok) return parsed.response;

    if (!isEmbeddingsEnabled()) {
      return NextResponse.json({
        success: true,
        disabled: true,
        message: SIMILAR_WORDS_DISABLED_MESSAGE,
        processedSources: 0,
      });
    }

    const { userId, mode } = parsed.data;
    const client = deps.createAdminClient();
    const allUserWords = await deps.fetchUserWords(client, userId);
    if (allUserWords.length === 0) {
      return NextResponse.json({
        success: true,
        mode,
        rebuiltSourceCount: 0,
        rebuiltImpactedCount: 0,
      });
    }

    const wordIdsInUserScope = new Set(allUserWords.map((word) => word.id));
    const newWordIds = mode === 'single_word'
      ? dedupeIds([parsed.data.sourceWordId!]).filter((wordId) => wordIdsInUserScope.has(wordId))
      : dedupeIds(parsed.data.newWordIds).filter((wordId) => wordIdsInUserScope.has(wordId));

    const rebuiltSourceCount = await deps.refreshCacheForSources(client, {
      userId,
      sourceWordIds: newWordIds,
      allUserWords,
    });

    let rebuiltImpactedCount = 0;
    if (mode === 'on_new_words' && newWordIds.length > 0) {
      const newWordSet = new Set(newWordIds);
      const newWords = allUserWords.filter((word) => newWordSet.has(word.id));
      const impactedSourceIds = await deps.collectImpactedSourceIds(client, {
        userId,
        newWords,
      });

      rebuiltImpactedCount = await deps.refreshCacheForSources(client, {
        userId,
        sourceWordIds: impactedSourceIds,
        allUserWords,
      });
    }

    return NextResponse.json({
      success: true,
      mode,
      rebuiltSourceCount,
      rebuiltImpactedCount,
    });
  } catch (error) {
    console.error('Similar cache rebuild failed:', error);
    return NextResponse.json({ error: '類似語キャッシュの再構築に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleSimilarCacheRebuildPost(request, defaultDeps);
}
