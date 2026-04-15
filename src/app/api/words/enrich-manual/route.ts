import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';

/**
 * POST /api/words/enrich-manual
 *
 * 手動単語追加時に、未入力の補助フィールドをAIで素早く補完するエンドポイント。
 * 補完対象:
 *   - japanese (日本語訳)
 *   - pronunciation (IPA発音記号)
 *   - partOfSpeechTags (品詞タグ)
 *   - exampleSentence / exampleSentenceJa (例文と訳)
 *
 * ユーザがすでに入力した項目はそのまま返し、欠けているフィールドだけを1回の
 * Gemini 2.5 Flash 呼び出しで生成する (目標: 1〜2秒)。DB書き込みは行わず、
 * 呼び出し側 (手動追加フォーム) が結果を取得して /api/words/create で保存する。
 */

const requestSchema = z.object({
  english: z.string().trim().min(1).max(100),
  japanese: z.string().trim().max(300).optional(),
  exampleSentence: z.string().trim().max(500).optional(),
  exampleSentenceJa: z.string().trim().max(500).optional(),
  pronunciation: z.string().trim().max(120).optional(),
  partOfSpeechTags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
}).strict();

// 品詞タグは単一カテゴリに絞る (既存の generate-examples と同じ分類)
const partOfSpeechTagsSchema = z.preprocess((value) => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  return [];
}, z.array(z.string()).default([]));

const aiResponseSchema = z.object({
  japanese: z.string().optional().default(''),
  pronunciation: z.string().optional().default(''),
  partOfSpeechTags: partOfSpeechTagsSchema,
  exampleSentence: z.string().optional().default(''),
  exampleSentenceJa: z.string().optional().default(''),
});

const SYSTEM_PROMPT = `あなたは英語教師です。与えられた英単語・フレーズに対して、学習者向けの情報を生成してください。

【ルール】
1. pronunciation は IPA (国際音声記号) 形式の発音記号を "/ /" で囲んで返す (例: "/bjuːˈtɪfəl/")
2. partOfSpeechTags は以下から1つだけ選ぶ: noun, verb, adjective, adverb, idiom, phrasal_verb, preposition, conjunction, pronoun, determiner, interjection, auxiliary, other
3. exampleSentence は 10〜20 語程度の実用的で分かりやすい英文 (中学〜高校レベル)
4. exampleSentenceJa は exampleSentence の自然な日本語訳
5. japanese は単語の主な日本語訳 (最大30文字程度)
6. リクエストで既に値が渡されたフィールドがある場合は、そのフィールドを空文字で返すこと (再生成しない)
7. 必ず純粋なJSONのみで返答する`;

const ENRICH_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('AI enrichment timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. 認証
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // 2. リクエストのパース
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      parseMessage: 'リクエストの解析に失敗しました',
      invalidMessage: '無効なリクエスト形式です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const input = parsed.data;
    const englishTrimmed = input.english.trim();
    const providedJapanese = input.japanese?.trim() ?? '';
    const providedPronunciation = input.pronunciation?.trim() ?? '';
    const providedExample = input.exampleSentence?.trim() ?? '';
    const providedExampleJa = input.exampleSentenceJa?.trim() ?? '';
    const providedPosTags = normalizePartOfSpeechTags(input.partOfSpeechTags ?? []);

    const needs = {
      japanese: providedJapanese.length === 0,
      pronunciation: providedPronunciation.length === 0,
      partOfSpeechTags: providedPosTags.length === 0,
      exampleSentence: providedExample.length === 0 || providedExampleJa.length === 0,
    };

    // 全フィールド入力済みの場合は AI 呼び出しをスキップして即返却
    if (!needs.japanese && !needs.pronunciation && !needs.partOfSpeechTags && !needs.exampleSentence) {
      return NextResponse.json({
        success: true,
        enriched: {
          japanese: providedJapanese,
          pronunciation: providedPronunciation,
          partOfSpeechTags: providedPosTags,
          exampleSentence: providedExample,
          exampleSentenceJa: providedExampleJa,
        },
        generatedFields: [],
      });
    }

    // 3. AI 呼び出し設定
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const apiKeys = { gemini: geminiApiKey, openai: openaiApiKey };

    // 高速な gemini-2.5-flash を使用 (1〜2 秒の目標を達成するため)
    const config = {
      ...AI_CONFIG.defaults.gemini,
      temperature: 0.3,
      maxOutputTokens: 512,
      responseFormat: 'json' as const,
    };

    let provider;
    try {
      provider = getProviderFromConfig(config, apiKeys);
    } catch (providerError) {
      console.error('[enrich-manual] Provider init failed:', providerError);
      return NextResponse.json(
        { success: false, error: 'AIプロバイダーの初期化に失敗しました' },
        { status: 500 }
      );
    }

    const neededFieldsJa: string[] = [];
    if (needs.japanese) neededFieldsJa.push('japanese (日本語訳)');
    if (needs.pronunciation) neededFieldsJa.push('pronunciation (IPA発音記号)');
    if (needs.partOfSpeechTags) neededFieldsJa.push('partOfSpeechTags (品詞)');
    if (needs.exampleSentence) neededFieldsJa.push('exampleSentence + exampleSentenceJa (例文とその訳)');

    const userPrompt = [
      `英単語: "${englishTrimmed}"`,
      providedJapanese ? `既存の日本語訳: "${providedJapanese}"` : null,
      providedPosTags.length > 0 ? `既存の品詞: ${providedPosTags.join(', ')}` : null,
      providedExample ? `既存の例文: "${providedExample}"` : null,
      providedPronunciation ? `既存の発音記号: "${providedPronunciation}"` : null,
      '',
      `生成するべきフィールド: ${neededFieldsJa.join(', ')}`,
      '',
      '【出力形式】',
      '{',
      '  "japanese": "日本語訳(生成対象の場合のみ)",',
      '  "pronunciation": "/IPA/(生成対象の場合のみ)",',
      '  "partOfSpeechTags": ["noun"],',
      '  "exampleSentence": "English example sentence.",',
      '  "exampleSentenceJa": "例文の日本語訳。"',
      '}',
    ].filter((line) => line !== null).join('\n');

    const aiStart = Date.now();
    let aiResponse;
    try {
      aiResponse = await withTimeout(
        provider.generateText(`${SYSTEM_PROMPT}\n\n${userPrompt}`, config),
        ENRICH_TIMEOUT_MS,
      );
    } catch (aiError) {
      console.error('[enrich-manual] AI call failed:', aiError);
      return NextResponse.json(
        { success: false, error: 'AIによる補完に失敗しました' },
        { status: 500 }
      );
    }
    const aiElapsedMs = Date.now() - aiStart;

    if (!aiResponse.success) {
      console.error('[enrich-manual] AI generation failed:', aiResponse.error);
      return NextResponse.json(
        { success: false, error: 'AIによる補完に失敗しました' },
        { status: 500 }
      );
    }

    // 4. レスポンスのパース
    let parsedAi: z.infer<typeof aiResponseSchema>;
    try {
      parsedAi = aiResponseSchema.parse(parseJsonResponse(aiResponse.content));
    } catch (parseError) {
      console.error('[enrich-manual] Failed to parse AI response:', parseError, aiResponse.content);
      return NextResponse.json(
        { success: false, error: 'AIレスポンスの解析に失敗しました' },
        { status: 500 }
      );
    }

    // 5. ユーザ入力を優先し、不足分のみを埋める
    const generatedFields: string[] = [];

    const finalJapanese = needs.japanese
      ? (parsedAi.japanese || '').trim()
      : providedJapanese;
    if (needs.japanese && finalJapanese) generatedFields.push('japanese');

    const finalPronunciation = needs.pronunciation
      ? (parsedAi.pronunciation || '').trim()
      : providedPronunciation;
    if (needs.pronunciation && finalPronunciation) generatedFields.push('pronunciation');

    const finalPosTags = needs.partOfSpeechTags
      ? normalizePartOfSpeechTags(parsedAi.partOfSpeechTags)
      : providedPosTags;
    if (needs.partOfSpeechTags && finalPosTags.length > 0) generatedFields.push('partOfSpeechTags');

    const finalExample = providedExample || (parsedAi.exampleSentence || '').trim();
    const finalExampleJa = providedExampleJa || (parsedAi.exampleSentenceJa || '').trim();
    if (needs.exampleSentence && finalExample && finalExampleJa) {
      generatedFields.push('exampleSentence');
    }

    console.log('[enrich-manual] Completed', {
      english: englishTrimmed,
      aiElapsedMs,
      generatedFields,
    });

    return NextResponse.json({
      success: true,
      enriched: {
        japanese: finalJapanese,
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
