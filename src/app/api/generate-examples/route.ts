import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { generateExampleSentences, saveExamplesToLexicon } from '@/lib/ai/generate-example-sentences';
import { fetchExampleGenresForUser } from '@/lib/preferences/example-genres';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readBooleanEnv,
  readNumberEnv,
} from '@/lib/ai/feature-usage';

// リクエストスキーマ
const requestSchema = z.object({
  words: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      english: z.string().trim().min(1).max(200),
      japanese: z.string().trim().min(1).max(300),
    }).strict(),
  ).min(1).max(30), // 最大30語まで
}).strict();

/**
 * POST /api/generate-examples
 *
 * 指定された単語に対して例文を生成するAPI
 *
 * - 認証済みユーザー: 既に例文がある単語はスキップ（DBチェック）、生成後DBに保存
 * - 認証要件は REQUIRE_AUTH_GENERATE_EXAMPLES で制御
 * - 常にexamplesフィールドでクライアントに生成結果を返す
 */
export async function POST(request: NextRequest) {
  try {
    // ============================================
    // 1. AUTHENTICATION CHECK
    // ============================================
    const requireAuth = readBooleanEnv('REQUIRE_AUTH_GENERATE_EXAMPLES', true);
    const enableUsageLimits = isAiUsageLimitsEnabled();
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (requireAuth && (authError || !user)) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    if (enableUsageLimits) {
      if (!user) {
        return NextResponse.json(
          { success: false, error: '認証が必要です。ログインしてください。' },
          { status: 401 }
        );
      }

      const usage = await checkAndIncrementFeatureUsage({
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
          { status: 429 }
        );
      }
    }

    const isLoggedIn = !!user;

    // ============================================
    // 2. PARSE REQUEST BODY
    // ============================================
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      parseMessage: 'リクエストの解析に失敗しました',
      invalidMessage: '無効なリクエスト形式です',
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: '無効なリクエスト形式です' },
        { status: 400 }
      );
    }

    const { words } = parsed.data;
    const wordIds = words.map(w => w.id);

    // ============================================
    // 3. CHECK WHICH WORDS NEED EXAMPLES (DB check for logged-in users only)
    // ============================================
    let wordsNeedingExamples = words;

    if (isLoggedIn) {
      const { data: existingWords } = await supabase
        .from('words')
        .select('id, example_sentence, part_of_speech_tags')
        .in('id', wordIds);

      const wordsWithExamples = new Set(
        (existingWords || [])
          .filter(
            (w) =>
              w.example_sentence &&
              w.example_sentence.trim().length > 0 &&
              Array.isArray(w.part_of_speech_tags) &&
              w.part_of_speech_tags.some((tag) => typeof tag === 'string' && tag.trim().length > 0)
          )
          .map(w => w.id)
      );

      wordsNeedingExamples = words.filter(w => !wordsWithExamples.has(w.id));

      if (wordsNeedingExamples.length === 0) {
        return NextResponse.json({
          success: true,
          message: '全ての単語に既に例文が設定されています',
          generated: 0,
          skipped: words.length,
          examples: [],
        });
      }
    }

    // ============================================
    // 4. GENERATE EXAMPLES WITH AI
    // ============================================
    // ユーザの興味ジャンルを例文生成プロンプトへ反映（Free含む全プラン）
    const exampleGenres = user ? await fetchExampleGenresForUser(supabase, user.id) : [];

    let generationResult;
    try {
      generationResult = await generateExampleSentences(
        wordsNeedingExamples,
        {
          gemini: process.env.GOOGLE_AI_API_KEY,
          openai: process.env.OPENAI_API_KEY,
        },
        { genres: exampleGenres },
      );
    } catch (aiError) {
      console.error('AI example generation error:', aiError);
      return NextResponse.json(
        { success: false, error: '例文の生成に失敗しました' },
        { status: 500 }
      );
    }

    if (generationResult.examples.length === 0) {
      console.error('AI example generation returned no examples:', generationResult.errors);
      return NextResponse.json(
        { success: false, error: '例文の生成に失敗しました' },
        { status: 500 },
      );
    }

    // ============================================
    // 5. SAVE TO DATABASE (logged-in users only)
    // ============================================
    let successCount = 0;
    let failureCount = generationResult.summary.failed;

    if (isLoggedIn) {
      for (const example of generationResult.examples) {
        if (!wordsNeedingExamples.find(w => w.id === example.wordId)) continue;

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
            console.error(`Failed to update example for word ${example.wordId}:`, updateError);
            failureCount++;
          } else {
            successCount++;
          }
        } catch (error) {
          console.error(`Failed to update example for word ${example.wordId}:`, error);
          failureCount++;
        }
      }
    } else {
      successCount = generationResult.examples.length;
    }

    // ============================================
    // 5.5 SAVE TO LEXICON MASTER (best-effort)
    // ジャンル指定で個人向けに生成した例文は共有マスターには書き込まない。
    // ============================================
    if (isLoggedIn && exampleGenres.length === 0) {
      // Fetch lexicon_entry_id for the words we just generated examples for
      const generatedWordIds = generationResult.examples.map(ex => ex.wordId);
      const { data: wordsWithLexicon } = await supabase
        .from('words')
        .select('id, lexicon_entry_id')
        .in('id', generatedWordIds)
        .not('lexicon_entry_id', 'is', null);

      if (wordsWithLexicon && wordsWithLexicon.length > 0) {
        const lexiconUpdates = wordsWithLexicon
          .map(w => {
            const example = generationResult.examples.find(ex => ex.wordId === w.id);
            if (!example || !w.lexicon_entry_id) return null;
            return {
              lexiconEntryId: w.lexicon_entry_id,
              exampleSentence: example.exampleSentence,
              exampleSentenceJa: example.exampleSentenceJa,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        if (lexiconUpdates.length > 0) {
          const lexResult = await saveExamplesToLexicon(lexiconUpdates);
          console.log('[generate-examples] Lexicon master update:', lexResult);
        }
      }
    }

    // ============================================
    // 6. RETURN SUCCESS RESPONSE (always include examples)
    // ============================================
    return NextResponse.json({
      success: true,
      message: `${successCount}件の例文を生成しました`,
      generated: successCount,
      failed: failureCount,
      skipped: words.length - wordsNeedingExamples.length,
      errors: generationResult.errors,
      examples: generationResult.examples,
    });
  } catch (error) {
    console.error('Generate examples API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
