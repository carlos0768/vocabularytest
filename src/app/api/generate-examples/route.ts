import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import {
  generateExampleSentences,
  saveExamplesToLexicon,
  type ExampleSeedWord,
  type GenerateExamplesResult,
} from '@/lib/ai/generate-example-sentences';
import { getAPIKeys } from '@/lib/ai/config';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readBooleanEnv,
  readNumberEnv,
} from '@/lib/ai/feature-usage';

const wordSchema = z.object({
  id: z.string().trim().min(1).max(80),
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().min(1).max(300),
}).strict();

const requestSchema = z.object({
  words: z.array(wordSchema).min(1).max(30).optional(),
  projectId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  const hasWords = Array.isArray(value.words);
  const hasProjectId = typeof value.projectId === 'string';
  if (hasWords === hasProjectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'words か projectId のどちらか一方が必要です',
      path: ['words'],
    });
  }
});

type AuthResult = {
  user: { id: string } | null;
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>;
};

type ExistingWordRow = {
  id: string;
  example_sentence?: string | null;
  part_of_speech_tags?: unknown;
  lexicon_entry_id?: string | null;
};

type GenerateExamplesDeps = {
  createClient?: typeof createRouteHandlerClient;
  checkUsage?: typeof checkAndIncrementFeatureUsage;
  generateExamples?: (
    words: ExampleSeedWord[],
    apiKeys: ReturnType<typeof getAPIKeys>,
  ) => Promise<GenerateExamplesResult>;
  saveLexiconExamples?: typeof saveExamplesToLexicon;
  loadWordsByProjectId?: (
    supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
    userId: string,
    projectId: string,
  ) => Promise<ExampleSeedWord[]>;
};

async function resolveAuth(
  request: NextRequest,
  createClient: typeof createRouteHandlerClient,
): Promise<AuthResult> {
  const supabase = await createClient(request);
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const { data: { user }, error: authError } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  if (authError || !user) {
    return { user: null, supabase };
  }

  return { user: { id: user.id }, supabase };
}

async function defaultLoadWordsByProjectId(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  userId: string,
  projectId: string,
): Promise<ExampleSeedWord[]> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (projectError) {
    throw new Error(`project_lookup_failed:${projectError.message}`);
  }
  if (!project) {
    throw new Error('project_not_found');
  }

  const { data: words, error: wordsError } = await supabase
    .from('words')
    .select('id, english, japanese')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(30);

  if (wordsError) {
    throw new Error(`project_words_lookup_failed:${wordsError.message}`);
  }

  return ((words ?? []) as Array<{ id: string; english: string; japanese: string }>).map((word) => ({
    id: word.id,
    english: word.english,
    japanese: word.japanese,
  }));
}

export async function handleGenerateExamplesPost(
  request: NextRequest,
  deps: GenerateExamplesDeps = {},
) {
  try {
    const requireAuth = readBooleanEnv('REQUIRE_AUTH_GENERATE_EXAMPLES', true);
    const enableUsageLimits = isAiUsageLimitsEnabled();
    const createClient = deps.createClient ?? createRouteHandlerClient;
    const checkUsage = deps.checkUsage ?? checkAndIncrementFeatureUsage;
    const generateExamples = deps.generateExamples ?? generateExampleSentences;
    const saveLexiconExamples = deps.saveLexiconExamples ?? saveExamplesToLexicon;
    const loadWordsByProjectId = deps.loadWordsByProjectId ?? defaultLoadWordsByProjectId;

    const { user, supabase } = await resolveAuth(request, createClient);

    if (requireAuth && !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    if (enableUsageLimits) {
      if (!user) {
        return NextResponse.json(
          { success: false, error: '認証が必要です。ログインしてください。' },
          { status: 401 },
        );
      }

      const usage = await checkUsage({
        supabase,
        featureKey: 'generate_examples',
        freeDailyLimit: readNumberEnv('AI_LIMIT_EXAMPLES_FREE_DAILY', 15),
        proDailyLimit: readNumberEnv('AI_LIMIT_EXAMPLES_PRO_DAILY', 150),
      });

      if (!usage.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `本日の例文生成上限（${usage.limit ?? '∞'}回）に達しました。`,
            limitReached: true,
            usage: {
              currentCount: usage.current_count,
              limit: usage.limit,
              isPro: usage.is_pro,
              requiresPro: usage.requires_pro,
            },
          },
          { status: 429 },
        );
      }
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      parseMessage: 'リクエストの解析に失敗しました',
      invalidMessage: '無効なリクエスト形式です',
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: '無効なリクエスト形式です' },
        { status: 400 },
      );
    }

    const requestWords = parsed.data.projectId
      ? await loadWordsByProjectId(supabase, user?.id ?? '', parsed.data.projectId)
      : parsed.data.words ?? [];

    if (requestWords.length === 0) {
      return NextResponse.json({
        success: true,
        message: '例文を生成できる単語がありません',
        generated: 0,
        failed: 0,
        skipped: 0,
        examples: [],
      });
    }

    const isLoggedIn = Boolean(user);
    const wordIds = requestWords.map((word) => word.id);
    let wordsNeedingExamples = requestWords;
    let existingWordRows: ExistingWordRow[] = [];

    if (isLoggedIn) {
      const { data: existingWords, error: existingWordsError } = await supabase
        .from('words')
        .select('id, example_sentence, part_of_speech_tags, lexicon_entry_id')
        .in('id', wordIds);

      if (existingWordsError) {
        return NextResponse.json(
          { success: false, error: '既存例文の確認に失敗しました' },
          { status: 500 },
        );
      }

      existingWordRows = (existingWords ?? []) as ExistingWordRow[];
      const wordsWithExamples = new Set(
        existingWordRows
          .filter((word) =>
            word.example_sentence &&
            word.example_sentence.trim().length > 0 &&
            Array.isArray(word.part_of_speech_tags) &&
            word.part_of_speech_tags.some((tag) => typeof tag === 'string' && tag.trim().length > 0),
          )
          .map((word) => word.id),
      );

      wordsNeedingExamples = requestWords.filter((word) => !wordsWithExamples.has(word.id));

      if (wordsNeedingExamples.length === 0) {
        return NextResponse.json({
          success: true,
          message: '全ての単語に既に例文が設定されています',
          generated: 0,
          failed: 0,
          skipped: requestWords.length,
          examples: [],
        });
      }
    }

    const generated = await generateExamples(wordsNeedingExamples, getAPIKeys());

    let successCount = 0;
    let failureCount = generated.summary.failed;
    if (isLoggedIn) {
      for (const example of generated.examples) {
        try {
          const { error: updateError } = await supabase
            .from('words')
            .update({
              example_sentence: example.exampleSentence,
              example_sentence_ja: example.exampleSentenceJa,
              part_of_speech_tags: normalizePartOfSpeechTags(example.partOfSpeechTags),
            })
            .eq('id', example.wordId);

          if (updateError) {
            console.error(`[generate-examples] Failed to persist ${example.wordId}:`, updateError);
            failureCount++;
            continue;
          }

          successCount++;
        } catch (error) {
          console.error(`[generate-examples] Failed to persist ${example.wordId}:`, error);
          failureCount++;
        }
      }
    } else {
      successCount = generated.examples.length;
    }

    if (isLoggedIn && generated.examples.length > 0) {
      const generatedWordIds = generated.examples.map((example) => example.wordId);
      const lexiconUpdates = existingWordRows
        .filter((word) => generatedWordIds.includes(word.id) && typeof word.lexicon_entry_id === 'string')
        .map((word) => {
          const example = generated.examples.find((candidate) => candidate.wordId === word.id);
          if (!example || !word.lexicon_entry_id) return null;
          return {
            lexiconEntryId: word.lexicon_entry_id,
            exampleSentence: example.exampleSentence,
            exampleSentenceJa: example.exampleSentenceJa,
          };
        })
        .filter((value): value is NonNullable<typeof value> => value !== null);

      if (lexiconUpdates.length > 0) {
        await saveLexiconExamples(lexiconUpdates);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${successCount}件の例文を生成しました`,
      generated: successCount,
      failed: failureCount,
      skipped: requestWords.length - wordsNeedingExamples.length,
      examples: generated.examples,
      errors: generated.errors,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
    if (code === 'project_not_found') {
      return NextResponse.json(
        { success: false, error: '指定した単語帳が見つかりません。' },
        { status: 404 },
      );
    }

    console.error('Generate examples API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleGenerateExamplesPost(request);
}
