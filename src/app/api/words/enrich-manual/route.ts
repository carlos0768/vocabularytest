import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  buildManualEnrichPrompt,
  fetchManualEnrichmentFromMaster,
  type ManualMasterEnrichment,
} from '@/lib/words/manual-enrichment';
import { saveExamplesToLexicon } from '@/lib/ai/generate-example-sentences';
import { saveQuizContentToLexicon } from '@/lib/lexicon/quiz-content-lexicon';
import { AI_CONFIG, getAPIKeys } from '@/lib/ai/config';
import { getProviderFromConfig, getProvider, isCloudRunConfigured } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { resolveMorphologyForWords } from '@/lib/morphology/resolve';
import { hasDisplayableMorphology } from '@/lib/morphology/format';
import { chargeManualMorphologyCoins } from '@/lib/coins/manual-morphology-gate';
import type { CoinInfo } from '@/lib/coins/scan-gate';
import { normalizeHeadword } from '../../../../../shared/lexicon';
import type { WordMorphology } from '../../../../../shared/types';

/**
 * POST /api/words/enrich-manual
 *
 * 手動単語追加時に、未入力の補助フィールドをAIで素早く補完する。
 * body パース → AI 呼び出しを即座に開始し、認証チェックと並列実行する。
 * 認証失敗時は AI 結果を破棄して 401 を返す。
 *
 * あわせて語源解析（morphology）もスキャン経路と同じ resolver で best-effort
 * 生成し、成功時のみ `morphology` としてレスポンスに含める。生成は補完 AI と
 * 並列で走り、失敗・タイムアウトしても手動追加は成功させる。
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
const MORPHOLOGY_TIMEOUT_MS = 8000;

/**
 * promise を ms でタイムアウトさせ、間に合わなければ fallback を返す。
 * タイマーは必ず解除する。
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

/**
 * 単語1語の語源解析を best-effort で解決する。
 * スキャン経路と同じ resolver（lexicon キャッシュ照会 → 候補マッチ → AI 生成 →
 * lexicon 保存）を使うので、既知語は即時ヒットし全ユーザーで結果を共有する。
 * 表示可能な語源構造がない場合や失敗時は undefined を返す（例外は投げない）。
 */
async function resolveManualMorphology(english: string): Promise<WordMorphology | undefined> {
  try {
    const morphologyMap = await resolveMorphologyForWords([{ english }], getAPIKeys());
    const morphology = morphologyMap.get(normalizeHeadword(english));
    return hasDisplayableMorphology(morphology) ? morphology : undefined;
  } catch (error) {
    console.error('[enrich-manual] Morphology generation failed (non-critical):', error);
    return undefined;
  }
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

    // 2a. 語源解析を先に開始 (best-effort, auth 完了を待たない)。
    // resolveManualMorphology は例外を投げず、タイムアウト時は undefined を返す。
    const morphologyPromise = withTimeout(
      resolveManualMorphology(englishTrimmed),
      MORPHOLOGY_TIMEOUT_MS,
      undefined,
    );

    // 2b. lexiconマスターを優先参照（DBクエリ1回・ベストエフォート）。
    // マスターに値がある分はAI生成をスキップし、頻出語のAIコストを
    // ユーザー横断で1回きりにする。
    let master: ManualMasterEnrichment | null = null;
    try {
      master = await fetchManualEnrichmentFromMaster(
        getSupabaseAdmin(),
        englishTrimmed,
        filledJapanese,
      );
    } catch {
      master = null;
    }

    const masterPronunciation = needsPronunciation ? (master?.pronunciation ?? '') : '';
    const masterPosTags = needsPos
      ? normalizePartOfSpeechTags(master?.partOfSpeechTags ?? [])
      : [];
    const masterExample = needsExample ? (master?.exampleSentence ?? '') : '';
    const masterExampleJa = needsExample ? (master?.exampleSentenceJa ?? '') : '';

    const aiNeedsPronunciation = needsPronunciation && !masterPronunciation;
    const aiNeedsPos = needsPos && masterPosTags.length === 0;
    const aiNeedsExample = needsExample && !(masterExample && masterExampleJa);
    const needsAi = aiNeedsPronunciation || aiNeedsPos || aiNeedsExample;

    // 2c. マスターで埋まらなかったフィールドのみAI生成を開始 (auth 完了を待たない)
    let aiPromise: Promise<import('@/lib/ai/providers').AIResponse> | null = null;
    if (needsAi) {
      try {
        const { provider, config } = getEnrichProvider();
        const prompt = buildManualEnrichPrompt(englishTrimmed, filledJapanese, {
          pronunciation: aiNeedsPronunciation,
          pos: aiNeedsPos,
          example: aiNeedsExample,
        });
        aiPromise = provider.generateText(`${SYSTEM_PROMPT}\n\n${prompt}`, config);
      } catch {
        return NextResponse.json(
          { success: false, error: 'AIプロバイダーの初期化に失敗しました' },
          { status: 500 }
        );
      }
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

    // 4. AI 結果を取得 (auth 中に既に進行していたので待ち時間が短い)。
    //    マスターで全フィールドが埋まった場合はAIコール自体が無い。
    const aiStart = Date.now();
    let parsedAi: z.infer<typeof aiResponseSchema> = {
      pronunciation: '',
      partOfSpeechTags: [],
      exampleSentence: '',
      exampleSentenceJa: '',
    };
    if (aiPromise) {
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

      if (!aiResponse.success) {
        return NextResponse.json(
          { success: false, error: 'AIによる補完に失敗しました' },
          { status: 500 }
        );
      }

      // 5. レスポンスのパース
      try {
        parsedAi = aiResponseSchema.parse(parseJsonResponse(aiResponse.content));
      } catch {
        console.error('[enrich-manual] Parse failed:', aiResponse.content);
        return NextResponse.json(
          { success: false, error: 'AIレスポンスの解析に失敗しました' },
          { status: 500 }
        );
      }
    }
    const aiWaitMs = Date.now() - aiStart;

    // 6. ユーザ入力 > マスター > AI の優先順で埋める
    const generatedFields: string[] = [];

    const aiPronunciation = (parsedAi.pronunciation || '').trim();
    const finalPronunciation = needsPronunciation
      ? (masterPronunciation || aiPronunciation)
      : filledPronunciation;
    if (needsPronunciation && finalPronunciation) generatedFields.push('pronunciation');

    const finalPosTags = needsPos
      ? (masterPosTags.length > 0 ? masterPosTags : normalizePartOfSpeechTags(parsedAi.partOfSpeechTags))
      : filledPosTags;
    if (needsPos && finalPosTags.length > 0) generatedFields.push('partOfSpeechTags');

    const aiExample = (parsedAi.exampleSentence || '').trim();
    const aiExampleJa = (parsedAi.exampleSentenceJa || '').trim();
    const finalExample = filledExample || masterExample || aiExample;
    const finalExampleJa = filledExampleJa || masterExampleJa || aiExampleJa;
    if (needsExample && finalExample && finalExampleJa) generatedFields.push('exampleSentence');

    // 6b. AI生成した発音・例文をマスターへ書き戻す（fill-if-empty・ベスト
    //     エフォート）。次に同じ単語を追加するユーザーはAIコール不要になる。
    if (master?.entryId) {
      const entryId = master.entryId;
      const writeBackPronunciation = aiNeedsPronunciation && aiPronunciation ? aiPronunciation : null;
      const writeBackExample = aiNeedsExample && aiExample && aiExampleJa
        ? { exampleSentence: aiExample, exampleSentenceJa: aiExampleJa }
        : null;
      if (writeBackPronunciation || writeBackExample) {
        after(async () => {
          try {
            if (writeBackPronunciation) {
              await saveQuizContentToLexicon([
                { lexiconEntryId: entryId, pronunciation: writeBackPronunciation },
              ]);
            }
            if (writeBackExample) {
              await saveExamplesToLexicon([
                { lexiconEntryId: entryId, ...writeBackExample },
              ]);
            }
          } catch (writeBackError) {
            console.error('[enrich-manual] Lexicon write-back failed (non-critical):', writeBackError);
          }
        });
      }
    }

    // 7. 並列実行していた語源解析を回収 (既に enrich と重なって進行済み)。
    //    表示可能な語源解析が得られたときだけコインを消費し（成果課金）、消費
    //    できたときのみ morphology を付与する。無料ユーザー・コイン不足時は
    //    語源解析を落として単語追加は成功させる（COIN_SYSTEM_ENABLED オフ時は
    //    従来どおり無料で付与）。
    const generatedMorphology = await morphologyPromise;
    let morphology = generatedMorphology;
    let coinInfo: CoinInfo | null = null;
    if (generatedMorphology) {
      const charge = await chargeManualMorphologyCoins(supabase, 1);
      coinInfo = charge.coinInfo;
      if (!charge.charged) {
        morphology = undefined;
      }
    }
    if (morphology) generatedFields.push('morphology');

    const totalMs = Date.now() - totalStart;
    console.log('[enrich-manual] Completed', {
      english: englishTrimmed,
      totalMs,
      aiWaitMs,
      generatedFields,
      morphology: Boolean(morphology),
      morphologyCharged: Boolean(coinInfo),
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
      ...(morphology ? { morphology } : {}),
      ...(coinInfo ? { coinInfo } : {}),
    });
  } catch (error) {
    console.error('[enrich-manual] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
