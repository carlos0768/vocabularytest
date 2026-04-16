import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig, getProvider, isCloudRunConfigured } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';

/**
 * POST /api/words/enrich-manual
 *
 * 手動単語追加時に、未入力の補助フィールドをAIで素早く補完する。
 * body パース → AI 呼び出しを即座に開始し、認証チェックと並列実行する。
 * 認証失敗時は AI 結果を破棄して 401 を返す。
 */

const requestSchema = z.object({
  english: z.string().trim().min(1).max(100),
  japanese: z.string().trim().max(300).optional(),
  exampleSentence: z.string().trim().max(500).optional(),
  exampleSentenceJa: z.string().trim().max(500).optional(),
  pronunciation: z.string().trim().max(120).optional(),
  partOfSpeechTags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
}).strict();

const partOfSpeechTagsSchema = z.preprocess((value) => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  return [];
}, z.array(z.string()).default([]));

const aiResponseSchema = z.object({
  pronunciation: z.string().optional().default(''),
  partOfSpeechTags: partOfSpeechTagsSchema,
  exampleSentence: z.string().optional().default(''),
  exampleSentenceJa: z.string().optional().default(''),
});

const SYSTEM_PROMPT = `英単語の補助情報をJSON形式で返せ。
pronunciation: IPA発音記号を"/.../"形式で返す
partOfSpeechTags: [noun/verb/adjective/adverb/idiom/phrasal_verb/other]から1つ
exampleSentence: 10〜15語の実用的な英文(中高レベル)
exampleSentenceJa: exampleSentenceの日本語訳
指示されたフィールドのみ生成せよ。`;

const ENRICH_TIMEOUT_MS = 8000;

function buildPrompt(english: string, japanese: string): string {
  return `"${english}"${japanese ? ` (${japanese})` : ''}\n生成: pronunciation, partOfSpeechTags, exampleSentence, exampleSentenceJa`;
}

function getEnrichProvider() {
  const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const config = {
    provider: AI_CONFIG.defaults.gemini.provider,
    model: 'gemini-2.0-flash',
    temperature: 0.3,
    maxOutputTokens: 256,
    responseFormat: 'json' as const,
  };
  // GOOGLE_AI_API_KEY があれば直接 Gemini API (Cloud Run バイパス)
  const provider = geminiApiKey && isCloudRunConfigured()
    ? getProvider('gemini', geminiApiKey)
    : getProviderFromConfig(config, { gemini: geminiApiKey, openai: openaiApiKey });
  return { provider, config };
}

export async function POST(request: NextRequest) {
  const totalStart = Date.now();
  try {
    // 1. body を最速でパース → AI 呼び出しを即開始
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: '無効なリクエスト形式です' },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const englishTrimmed = input.english.trim();
    const filledJapanese = input.japanese?.trim() ?? '';
    const filledPronunciation = input.pronunciation?.trim() ?? '';
    const filledExample = input.exampleSentence?.trim() ?? '';
    const filledExampleJa = input.exampleSentenceJa?.trim() ?? '';
    const filledPosTags = normalizePartOfSpeechTags(input.partOfSpeechTags ?? []);

    const needsPronunciation = filledPronunciation.length === 0;
    const needsPos = filledPosTags.length === 0;
    const needsExample = filledExample.length === 0 || filledExampleJa.length === 0;

    if (!needsPronunciation && !needsPos && !needsExample) {
      return NextResponse.json({
        success: true,
        enriched: {
          pronunciation: filledPronunciation,
          partOfSpeechTags: filledPosTags,
          exampleSentence: filledExample,
          exampleSentenceJa: filledExampleJa,
        },
        generatedFields: [],
      });
    }

    // 2. AI 呼び出しを即座に開始 (auth 完了を待たない)
    let aiPromise: Promise<import('@/lib/ai/providers').AIResponse>;
    try {
      const { provider, config } = getEnrichProvider();
      const prompt = buildPrompt(englishTrimmed, filledJapanese);
      aiPromise = provider.generateText(`${SYSTEM_PROMPT}\n\n${prompt}`, config);
    } catch {
      return NextResponse.json(
        { success: false, error: 'AIプロバイダーの初期化に失敗しました' },
        { status: 500 }
      );
    }

    // 3. 認証チェックを AI と並列で実行
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = await createRouteHandlerClient(request);
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      // 認証失敗 → AI 結果は破棄 (promise は自然完了させる)
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // 4. AI 結果を取得 (auth 中に既に進行していたので待ち時間が短い)
    const aiStart = Date.now();
    let aiResponse;
    try {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), ENRICH_TIMEOUT_MS);
      });
      try {
        aiResponse = await Promise.race([aiPromise, timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'AIによる補完に失敗しました' },
        { status: 500 }
      );
    }
    const aiWaitMs = Date.now() - aiStart;

    if (!aiResponse.success) {
      return NextResponse.json(
        { success: false, error: 'AIによる補完に失敗しました' },
        { status: 500 }
      );
    }

    // 5. レスポンスのパース
    let parsedAi: z.infer<typeof aiResponseSchema>;
    try {
      parsedAi = aiResponseSchema.parse(parseJsonResponse(aiResponse.content));
    } catch {
      console.error('[enrich-manual] Parse failed:', aiResponse.content);
      return NextResponse.json(
        { success: false, error: 'AIレスポンスの解析に失敗しました' },
        { status: 500 }
      );
    }

    // 6. ユーザ入力を優先し、不足分のみ埋める
    const generatedFields: string[] = [];

    const finalPronunciation = needsPronunciation
      ? (parsedAi.pronunciation || '').trim() : filledPronunciation;
    if (needsPronunciation && finalPronunciation) generatedFields.push('pronunciation');

    const finalPosTags = needsPos
      ? normalizePartOfSpeechTags(parsedAi.partOfSpeechTags) : filledPosTags;
    if (needsPos && finalPosTags.length > 0) generatedFields.push('partOfSpeechTags');

    const finalExample = filledExample || (parsedAi.exampleSentence || '').trim();
    const finalExampleJa = filledExampleJa || (parsedAi.exampleSentenceJa || '').trim();
    if (needsExample && finalExample && finalExampleJa) generatedFields.push('exampleSentence');

    const totalMs = Date.now() - totalStart;
    console.log('[enrich-manual] Completed', {
      english: englishTrimmed,
      totalMs,
      aiWaitMs,
      generatedFields,
    });

    return NextResponse.json({
      success: true,
      enriched: {
        pronunciation: finalPronunciation,
        partOfSpeechTags: finalPosTags,
        exampleSentence: finalExample,
        exampleSentenceJa: finalExampleJa,
      },
      generatedFields,
    });
  } catch (error) {
    console.error('[enrich-manual] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
