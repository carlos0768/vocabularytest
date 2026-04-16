import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { lookupLexiconEntriesByKeys } from '@/lib/lexicon/master-first-scan';
import { normalizeHeadword, resolvePrimaryLexiconPos } from '../../../../../shared/lexicon';

/**
 * POST /api/words/enrich-manual
 *
 * 手動単語追加時に、未入力の補助フィールドをAIで素早く補完するエンドポイント。
 *
 * 高速化のため lexicon_entries マスターテーブルを先に参照し、
 * キャッシュヒットしたフィールドは AI に聞かない。
 * AI 呼び出しは残った needs のみを対象にし、プロンプトを最小化する。
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
  japanese: z.string().optional().default(''),
  pronunciation: z.string().optional().default(''),
  partOfSpeechTags: partOfSpeechTagsSchema,
  exampleSentence: z.string().optional().default(''),
  exampleSentenceJa: z.string().optional().default(''),
});

// ---- プロンプト (圧縮版) ----

const SYSTEM_PROMPT = `英単語の情報をJSON形式で返せ。pronunciation="/IPA/"形式。partOfSpeechTags=noun/verb/adjective/adverb/idiom/phrasal_verb/preposition/conjunction/other から1つ。exampleSentence=10〜15語の英文。exampleSentenceJa=その日本語訳。japanese=主な日本語訳。指示されたフィールドのみ生成。`;

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

interface EnrichNeeds {
  japanese: boolean;
  pronunciation: boolean;
  partOfSpeechTags: boolean;
  exampleSentence: boolean;
}

function anyNeedsRemaining(needs: EnrichNeeds): boolean {
  return needs.japanese || needs.pronunciation || needs.partOfSpeechTags || needs.exampleSentence;
}

function buildPrompt(english: string, japanese: string, needs: EnrichNeeds): string {
  const parts: string[] = [`"${english}"${japanese ? ` (${japanese})` : ''}`];

  const fields: string[] = [];
  if (needs.pronunciation) fields.push('pronunciation');
  if (needs.partOfSpeechTags) fields.push('partOfSpeechTags');
  if (needs.exampleSentence) fields.push('exampleSentence,exampleSentenceJa');
  if (needs.japanese) fields.push('japanese');

  parts.push(`生成: ${fields.join(', ')}`);
  return parts.join('\n');
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
    let filledJapanese = input.japanese?.trim() ?? '';
    let filledPronunciation = input.pronunciation?.trim() ?? '';
    let filledExample = input.exampleSentence?.trim() ?? '';
    let filledExampleJa = input.exampleSentenceJa?.trim() ?? '';
    let filledPosTags = normalizePartOfSpeechTags(input.partOfSpeechTags ?? []);

    const needs: EnrichNeeds = {
      japanese: filledJapanese.length === 0,
      pronunciation: filledPronunciation.length === 0,
      partOfSpeechTags: filledPosTags.length === 0,
      exampleSentence: filledExample.length === 0 || filledExampleJa.length === 0,
    };

    // 全フィールド入力済み → AI 不要
    if (!anyNeedsRemaining(needs)) {
      return NextResponse.json({
        success: true,
        enriched: {
          japanese: filledJapanese,
          pronunciation: filledPronunciation,
          partOfSpeechTags: filledPosTags,
          exampleSentence: filledExample,
          exampleSentenceJa: filledExampleJa,
        },
        generatedFields: [],
      });
    }

    // 3. lexicon マスターテーブルで事前キャッシュヒット
    const generatedFields: string[] = [];
    let lexiconHit = false;

    try {
      const posForLookup = filledPosTags.length > 0
        ? resolvePrimaryLexiconPos(filledPosTags)
        : 'other';
      const normalizedHw = normalizeHeadword(englishTrimmed);

      // POS が不明な場合は複数の主要品詞で検索してヒットを狙う
      const lookupKeys = filledPosTags.length > 0
        ? [{ normalizedHeadword: normalizedHw, pos: posForLookup }]
        : ['noun', 'verb', 'adjective', 'adverb', 'other'].map((pos) => ({
            normalizedHeadword: normalizedHw,
            pos: pos as import('../../../../../shared/lexicon').LexiconPos,
          }));

      const entries = await lookupLexiconEntriesByKeys(lookupKeys);
      if (entries.length > 0) {
        // 最もデータが豊富なエントリを選ぶ
        const best = entries.reduce((a, b) => {
          const scoreA = (a.translationJa ? 1 : 0) + (a.exampleSentence ? 1 : 0) + (a.pos ? 1 : 0);
          const scoreB = (b.translationJa ? 1 : 0) + (b.exampleSentence ? 1 : 0) + (b.pos ? 1 : 0);
          return scoreB > scoreA ? b : a;
        });

        if (needs.partOfSpeechTags && best.pos) {
          filledPosTags = normalizePartOfSpeechTags([best.pos]);
          if (filledPosTags.length > 0) {
            needs.partOfSpeechTags = false;
            generatedFields.push('partOfSpeechTags');
            lexiconHit = true;
          }
        }
        if (needs.japanese && best.translationJa) {
          filledJapanese = best.translationJa;
          needs.japanese = false;
          generatedFields.push('japanese');
          lexiconHit = true;
        }
        if (needs.exampleSentence && best.exampleSentence && best.exampleSentenceJa) {
          filledExample = best.exampleSentence;
          filledExampleJa = best.exampleSentenceJa;
          needs.exampleSentence = false;
          generatedFields.push('exampleSentence');
          lexiconHit = true;
        }
      }
    } catch (lexiconError) {
      // lexicon lookup 失敗は無視して AI にフォールバック
      console.warn('[enrich-manual] lexicon lookup failed:', lexiconError);
    }

    // lexicon で全て埋まった → AI 不要 (pronunciation 以外)
    if (!anyNeedsRemaining(needs)) {
      console.log('[enrich-manual] All fields from lexicon', { english: englishTrimmed });
      return NextResponse.json({
        success: true,
        enriched: {
          japanese: filledJapanese,
          pronunciation: filledPronunciation,
          partOfSpeechTags: filledPosTags,
          exampleSentence: filledExample,
          exampleSentenceJa: filledExampleJa,
        },
        generatedFields,
      });
    }

    // 4. AI 呼び出し (残りの needs のみ)
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const apiKeys = { gemini: geminiApiKey, openai: openaiApiKey };

    const config = {
      ...AI_CONFIG.defaults.gemini,
      temperature: 0.3,
      maxOutputTokens: 256,
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

    const prompt = buildPrompt(englishTrimmed, filledJapanese, needs);

    const aiStart = Date.now();
    let aiResponse;
    try {
      aiResponse = await withTimeout(
        provider.generateText(`${SYSTEM_PROMPT}\n\n${prompt}`, config),
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

    // 5. レスポンスのパース
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

    // 6. AI 結果で残りを埋める
    if (needs.japanese) {
      const val = (parsedAi.japanese || '').trim();
      if (val) { filledJapanese = val; generatedFields.push('japanese'); }
    }
    if (needs.pronunciation) {
      const val = (parsedAi.pronunciation || '').trim();
      if (val) { filledPronunciation = val; generatedFields.push('pronunciation'); }
    }
    if (needs.partOfSpeechTags) {
      const tags = normalizePartOfSpeechTags(parsedAi.partOfSpeechTags);
      if (tags.length > 0) { filledPosTags = tags; generatedFields.push('partOfSpeechTags'); }
    }
    if (needs.exampleSentence) {
      const ex = (parsedAi.exampleSentence || '').trim();
      const exJa = (parsedAi.exampleSentenceJa || '').trim();
      if (ex && exJa) {
        filledExample = ex;
        filledExampleJa = exJa;
        generatedFields.push('exampleSentence');
      }
    }

    console.log('[enrich-manual] Completed', {
      english: englishTrimmed,
      aiElapsedMs,
      lexiconHit,
      generatedFields,
    });

    return NextResponse.json({
      success: true,
      enriched: {
        japanese: filledJapanese,
        pronunciation: filledPronunciation,
        partOfSpeechTags: filledPosTags,
        exampleSentence: filledExample,
        exampleSentenceJa: filledExampleJa,
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
