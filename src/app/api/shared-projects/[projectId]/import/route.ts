import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import type { SharedProjectImportResponse, SharedProjectImportWordMapping } from '@/lib/shared-projects/types';
import { isActiveProSubscription } from '@/lib/subscription/status';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { SHARE_VIEW_WORD_SELECT_COLUMNS } from '@/lib/words/resolved';
import type { Project, Word } from '@/types';
import {
  getDefaultSpacedRepetitionFields,
  mapProjectToInsertWithId,
  mapWordFromRow,
  mapWordToInsertWithId,
  type WordRow,
} from '../../../../../../shared/db';
import { requireSharedProjectAccess } from '../../shared';

const requestSchema = z.object({
  sourceWordIds: z.array(z.string().uuid()).min(1).max(2000),
}).strict();

const WORD_INSERT_CHUNK_SIZE = 200;

type Params = {
  projectId: string;
};

type SubscriptionRow = {
  status?: string | null;
  plan?: string | null;
  pro_source?: string | null;
  test_pro_expires_at?: string | null;
  current_period_end?: string | null;
};

type SharedImportDeps = {
  createClient?: typeof createRouteHandlerClient;
  requireAccess?: typeof requireSharedProjectAccess;
  now?: () => Date;
  createId?: () => string;
};

function getDeps(deps?: SharedImportDeps) {
  return {
    createClient: deps?.createClient ?? createRouteHandlerClient,
    requireAccess: deps?.requireAccess ?? requireSharedProjectAccess,
    now: deps?.now ?? (() => new Date()),
    createId: deps?.createId ?? randomUUID,
  };
}

function normalizeSourceWordIds(sourceWordIds: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const sourceWordId of sourceWordIds) {
    if (seen.has(sourceWordId)) continue;
    seen.add(sourceWordId);
    result.push(sourceWordId);
  }

  return result;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildImportedProject(input: {
  id: string;
  userId: string;
  title: string;
  importedFromShareId?: string;
  createdAt: string;
}): Project {
  return {
    id: input.id,
    userId: input.userId,
    title: input.title,
    sourceLabels: [],
    createdAt: input.createdAt,
    shareScope: 'private',
    importedFromShareId: input.importedFromShareId,
    isFavorite: false,
  };
}

function buildImportedWord(input: {
  id: string;
  projectId: string;
  createdAt: string;
  source: Word;
}): Word {
  const defaultSR = getDefaultSpacedRepetitionFields();

  return {
    id: input.id,
    projectId: input.projectId,
    english: input.source.english,
    japanese: input.source.japanese,
    vocabularyType: input.source.vocabularyType ?? null,
    distractors: input.source.distractors ?? [],
    exampleSentence: input.source.exampleSentence,
    exampleSentenceJa: input.source.exampleSentenceJa,
    pronunciation: input.source.pronunciation,
    partOfSpeechTags: input.source.partOfSpeechTags,
    status: 'new',
    createdAt: input.createdAt,
    lastReviewedAt: undefined,
    nextReviewAt: undefined,
    easeFactor: defaultSR.easeFactor,
    intervalDays: defaultSR.intervalDays,
    repetition: defaultSR.repetition,
    isFavorite: false,
  };
}

export async function handleSharedProjectImportPost(
  request: NextRequest,
  params: Params,
  deps?: SharedImportDeps,
) {
  try {
    const {
      createClient,
      requireAccess,
      now,
      createId,
    } = getDeps(deps);
    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const subscriptionResult = await supabase
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle<SubscriptionRow>();

    if (subscriptionResult.error) {
      throw new Error(subscriptionResult.error.message || 'subscription_lookup_failed');
    }

    const isPro = isActiveProSubscription({
      status: subscriptionResult.data?.status,
      plan: subscriptionResult.data?.plan,
      proSource: subscriptionResult.data?.pro_source,
      testProExpiresAt: subscriptionResult.data?.test_pro_expires_at,
      currentPeriodEnd: subscriptionResult.data?.current_period_end,
    });

    if (!isPro) {
      return NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 });
    }

    const access = await requireAccess(request, params.projectId);
    if (!access.ok) {
      return access.response;
    }
    if (!('access' in access)) {
      return NextResponse.json({ success: false, error: '共有単語帳にアクセスできません。' }, { status: 403 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '取り込み対象の単語データが不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const sourceWordIds = normalizeSourceWordIds(parsed.data.sourceWordIds);
    const sourceWordsResult = await supabase
      .from('words')
      .select(SHARE_VIEW_WORD_SELECT_COLUMNS)
      .eq('project_id', params.projectId)
      .in('id', sourceWordIds);

    if (sourceWordsResult.error) {
      throw new Error(sourceWordsResult.error.message || 'shared_source_words_lookup_failed');
    }

    const sourceWordById = new Map(
      ((sourceWordsResult.data ?? []) as WordRow[]).map((row) => {
        const word = mapWordFromRow(row);
        return [word.id, word] as const;
      }),
    );

    const orderedSourceWords: Word[] = [];
    for (const sourceWordId of sourceWordIds) {
      const sourceWord = sourceWordById.get(sourceWordId);
      if (!sourceWord) {
        return NextResponse.json({ success: false, error: '一部の共有単語が見つかりません。' }, { status: 400 });
      }
      orderedSourceWords.push(sourceWord);
    }

    const importedAt = now().toISOString();
    const importedProject = buildImportedProject({
      id: createId(),
      userId: user.id,
      title: access.access.project.title,
      importedFromShareId: access.access.project.shareId,
      createdAt: importedAt,
    });

    const wordMappings: SharedProjectImportWordMapping[] = [];
    const importedWords = orderedSourceWords.map((sourceWord) => {
      const targetWordId = createId();
      wordMappings.push({
        sourceWordId: sourceWord.id,
        targetWordId,
      });
      return buildImportedWord({
        id: targetWordId,
        projectId: importedProject.id,
        createdAt: importedAt,
        source: sourceWord,
      });
    });

    const insertedProject = await supabase
      .from('projects')
      .insert(mapProjectToInsertWithId(importedProject));

    if (insertedProject.error) {
      throw new Error(insertedProject.error.message || 'shared_import_project_insert_failed');
    }

    try {
      for (const wordChunk of chunkArray(importedWords, WORD_INSERT_CHUNK_SIZE)) {
        const insertResult = await supabase
          .from('words')
          .insert(wordChunk.map(mapWordToInsertWithId));

        if (insertResult.error) {
          throw new Error(insertResult.error.message || 'shared_import_words_insert_failed');
        }
      }
    } catch (error) {
      const cleanupResult = await supabase
        .from('projects')
        .delete()
        .eq('id', importedProject.id);

      if (cleanupResult.error) {
        console.error('shared-project import cleanup failed:', cleanupResult.error);
      }

      throw error;
    }

    const payload: SharedProjectImportResponse = {
      project: importedProject,
      importedAt,
      wordMappings,
    };

    return NextResponse.json({
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error('shared-project import error:', error);
    return NextResponse.json({ success: false, error: '共有単語帳の取り込みに失敗しました。' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  return handleSharedProjectImportPost(request, { projectId });
}
