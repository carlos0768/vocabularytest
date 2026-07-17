import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import {
  extractWordsFromImage,
  extractCircledWordsFromImage,
  extractEikenWordsFromImage,
  extractIdiomsFromImage,
  extractCompositeWordsFromImage,
} from '@/lib/ai';
import { getAPIKeys } from '@/lib/ai/config';
import {
  EXTRACT_MODES,
  applySourceModesFromScanModes,
  getMissingProviderKey,
  getMissingProviderKeyForModes,
  getProvidersForMode,
  getProvidersForModes,
  normalizeExtractModes,
  type ExtractMode,
} from '@/lib/scan/mode-provider';
import { randomUUID } from 'crypto';
import { consumeScanGate } from '@/lib/coins/scan-gate';
import { refundScanCoinsForJob } from '@/lib/coins/refund';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { ensureSourceLabels } from '../../../../shared/source-labels';
import { resolveImmediateWordsWithMasterFirst } from '@/lib/lexicon/master-first-scan';
import { backfillMissingJapaneseTranslationsWithMetadata } from '@/lib/words/backfill-japanese';
import { generateExampleSentences, saveExamplesToLexicon } from '@/lib/ai/generate-example-sentences';
import { fetchExampleGenresForProUser } from '@/lib/preferences/example-genres';
import { normalizeWordForTranslationPersistence } from '@/lib/words/translation-persistence';
import { isWordOrderEligible } from '@/lib/quiz/word-order';
import { fetchAiGenerationEnabled } from '@/lib/preferences/ai-generation';
import { runWithApiCostScanContext, updateApiCostScanContext } from '@/lib/api-cost/scan-context';
import { resolveMorphologyForWords } from '@/lib/morphology/resolve';
import { hasDisplayableMorphology } from '@/lib/morphology/format';
import { normalizeHeadword } from '../../../../shared/lexicon';
import { toUserFacingScanErrorMessage } from '@/lib/scan/scan-error-message';

export type { ExtractMode } from '@/lib/scan/mode-provider';

// EIKEN levels (null means no filter, required for 'eiken' mode)
export type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

const requestSchema = z.object({
  image: z.string().min(1).max(15_000_000),
  mode: z.enum(EXTRACT_MODES).optional().default('all'),
  scanModes: z.array(z.enum(EXTRACT_MODES)).min(1).max(EXTRACT_MODES.length).optional(),
  eikenLevel: z.enum(['5', '4', '3', 'pre2', '2', 'pre1', '1']).nullable().optional().default(null),
  includeMorphology: z.boolean().optional().default(false),
}).strict();

export const __internal = {
  getProvidersForMode,
  getProvidersForModes,
  getMissingProviderKey,
  getMissingProviderKeyForModes,
  normalizeExtractModes,
};

export type ExtractRouteDeps = {
  createClient?: typeof createRouteHandlerClient;
  getApiKeys?: typeof getAPIKeys;
  getProvidersForMode?: typeof getProvidersForMode;
  getProvidersForModes?: typeof getProvidersForModes;
  getMissingProviderKey?: typeof getMissingProviderKey;
  getMissingProviderKeyForModes?: typeof getMissingProviderKeyForModes;
  extractWords?: typeof extractWordsFromImage;
  extractCircledWords?: typeof extractCircledWordsFromImage;
  extractEikenWords?: typeof extractEikenWordsFromImage;
  extractIdioms?: typeof extractIdiomsFromImage;
  extractCompositeWords?: typeof extractCompositeWordsFromImage;
  resolveImmediateWords?: typeof resolveImmediateWordsWithMasterFirst;
  backfillWords?: typeof backfillMissingJapaneseTranslationsWithMetadata;
  generateExamples?: typeof generateExampleSentences;
  saveExamples?: typeof saveExamplesToLexicon;
  resolveMorphology?: typeof resolveMorphologyForWords;
  fetchAiGeneration?: typeof fetchAiGenerationEnabled;
};

function getDeps(deps?: ExtractRouteDeps): Required<ExtractRouteDeps> {
  return {
    createClient: deps?.createClient ?? createRouteHandlerClient,
    getApiKeys: deps?.getApiKeys ?? getAPIKeys,
    getProvidersForMode: deps?.getProvidersForMode ?? getProvidersForMode,
    getProvidersForModes: deps?.getProvidersForModes ?? getProvidersForModes,
    getMissingProviderKey: deps?.getMissingProviderKey ?? getMissingProviderKey,
    getMissingProviderKeyForModes: deps?.getMissingProviderKeyForModes ?? getMissingProviderKeyForModes,
    extractWords: deps?.extractWords ?? extractWordsFromImage,
    extractCircledWords: deps?.extractCircledWords ?? extractCircledWordsFromImage,
    extractEikenWords: deps?.extractEikenWords ?? extractEikenWordsFromImage,
    extractIdioms: deps?.extractIdioms ?? extractIdiomsFromImage,
    extractCompositeWords: deps?.extractCompositeWords ?? extractCompositeWordsFromImage,
    resolveImmediateWords: deps?.resolveImmediateWords ?? resolveImmediateWordsWithMasterFirst,
    backfillWords: deps?.backfillWords ?? backfillMissingJapaneseTranslationsWithMetadata,
    generateExamples: deps?.generateExamples ?? generateExampleSentences,
    saveExamples: deps?.saveExamples ?? saveExamplesToLexicon,
    resolveMorphology: deps?.resolveMorphology ?? resolveMorphologyForWords,
    fetchAiGeneration: deps?.fetchAiGeneration ?? fetchAiGenerationEnabled,
  };
}

function isMasterFirstResolutionEnabledForModes(modes: Iterable<ExtractMode>): boolean {
  const disabledModes = (process.env.MASTER_FIRST_SCAN_DISABLED_MODES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return normalizeExtractModes(Array.from(modes)).every((mode) => !disabledModes.includes(mode));
}

// API Route: POST /api/extract
// Extracts words from an uploaded image using configured AI provider
// SECURITY: Requires authentication, enforces server-side scan limits

export async function handleExtractPost(request: NextRequest, deps?: ExtractRouteDeps) {
  const {
    createClient,
    getApiKeys,
    getProvidersForModes: resolveProvidersForModes,
    getMissingProviderKeyForModes: resolveMissingProviderKeyForModes,
    extractWords,
    extractCircledWords,
    extractEikenWords,
    extractIdioms,
    extractCompositeWords,
    resolveImmediateWords,
    backfillWords,
    generateExamples,
    saveExamples,
    resolveMorphology,
    fetchAiGeneration,
  } = getDeps(deps);
  const startedAt = Date.now();
  // コイン消費後の失敗時に返還するためのキー（消費前は null）
  let coinScanRef: string | null = null;
  try {
    // ============================================
    // 1. AUTHENTICATION CHECK
    // ============================================
    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      console.log('Auth failed:', authError?.message || 'No user');
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ============================================
    // 2. PARSE REQUEST BODY
    // ============================================
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'リクエストの解析に失敗しました',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { image, mode, scanModes: requestedScanModes, eikenLevel, includeMorphology } = parsed.data as {
      image: string;
      mode: ExtractMode;
      scanModes?: ExtractMode[];
      eikenLevel: EikenLevel;
      includeMorphology: boolean;
    };
    const modes = normalizeExtractModes(requestedScanModes, [mode]);
    const primaryMode = modes[0] ?? 'all';
    updateApiCostScanContext({ userId: user.id, modes });

    // Detailed logging for debugging
    const imageLength = image?.length || 0;
    const hasDataPrefix = image?.startsWith('data:') || false;
    const dataTypeMatch = image?.match(/^data:([^;,]+)/);
    const detectedType = dataTypeMatch ? dataTypeMatch[1] : 'unknown';

    console.log('Extract API called:', {
      modes,
      primaryMode,
      eikenLevel,
      imageLength,
      hasDataPrefix,
      detectedType,
      first50Chars: image?.slice(0, 50),
    });

    // Validate base64 data URL format (accepts images and PDFs)
    const isValidImage = image.startsWith('data:image/');
    const isValidPdf = image.startsWith('data:application/pdf');

    if (!isValidImage && !isValidPdf) {
      console.error('Invalid file format - not image or PDF', { first100: image.slice(0, 100) });
      return NextResponse.json(
        { success: false, error: 'ファイル形式が不正です。JPEG/PNG形式の画像またはPDFを使用してください。' },
        { status: 400 }
      );
    }

    // OpenAI image endpoint does not accept PDF data URLs.
    // Return a clear message instead of surfacing a vague provider error.
    if (isValidPdf && resolveProvidersForModes(modes).includes('openai')) {
      return NextResponse.json(
        {
          success: false,
          error: '現在のサーバー設定ではPDF解析に対応していません。PDFを画像（PNG/JPEG）に変換して再アップロードしてください。',
        },
        { status: 400 }
      );
    }

    // Reject unsupported image formats (HEIC/HEIF are not supported by the extraction path)
    // This can happen when client-side HEIC conversion fails
    if (image.startsWith('data:image/heic') || image.startsWith('data:image/heif')) {
      console.error('Unsupported image format: HEIC/HEIF detected', { detectedType });
      return NextResponse.json(
        { success: false, error: 'HEIC/HEIF形式は対応していません。カメラアプリの設定で「互換性優先」を選択するか、スクリーンショットをお試しください。' },
        { status: 400 }
      );
    }

    // バリデーションとAPIキー確認はコイン消費より前に行う（検証失敗で課金しない）
    if (modes.includes('eiken') && !eikenLevel) {
      return NextResponse.json(
        { success: false, error: '英検レベルを指定してください' },
        { status: 400 }
      );
    }

    const apiKeys = getApiKeys();
    const missingProviderKey = resolveMissingProviderKeyForModes(modes, apiKeys);
    if (missingProviderKey) {
      const providerLabel = missingProviderKey === 'gemini' ? 'Google AI' : 'OpenAI';
      return NextResponse.json(
        { success: false, error: `${providerLabel} APIキーが設定されていません` },
        { status: 500 }
      );
    }

    // ============================================
    // 3. CHECK & CONSUME SCAN QUOTA (SERVER-SIDE ENFORCEMENT)
    // ============================================
    // Scanning is Pro-only for every mode. コイン制オン時は consume_scan_coins、
    // オフ時は従来の check_and_increment_scan_batch にフォールバックする。
    // このルートにはscan_jobs行が無いため、返還キーとしてUUIDを事前生成する。
    coinScanRef = randomUUID();
    const gate = await consumeScanGate(supabase, {
      modes,
      imageCount: 1,
      scanJobId: coinScanRef,
      includeMorphology,
    });

    if (!gate.ok) {
      if (gate.status === 500) {
        // RPCコミット後に応答だけ失われた可能性に備えたベストエフォート返還（冪等）
        await refundScanCoinsForJob(coinScanRef);
      }
      coinScanRef = null;
      const body =
        gate.status === 429 && !('insufficientCoins' in gate.body)
          ? {
              ...gate.body,
              error: `本日のスキャン上限（${(gate.body.scanInfo as { limit?: number | null })?.limit ?? '∞'}回）に達しました。Proプランにアップグレードすると無制限にスキャンできます。`,
            }
          : gate.body;
      return NextResponse.json({ success: false, ...body }, { status: gate.status });
    }

    const scanGateInfo = gate.scanInfo;
    const coinInfo = gate.coinInfo;

    // ============================================
    // 4. PROCESS IMAGE
    // ============================================
    let aiExtractionMs = 0;

    let result;
    const aiStart = Date.now();

    if (modes.length > 1) {
      result = await extractCompositeWords(image, apiKeys, {
        modes,
        eikenLevel,
      });
    } else if (primaryMode === 'idiom') {
      result = await extractIdioms(image, apiKeys);
    } else if (primaryMode === 'eiken') {
      // EIKEN filter mode
      result = await extractEikenWords(image, apiKeys, eikenLevel);
    } else if (primaryMode === 'circled') {
      // Note: eikenLevel is NOT used for circled mode anymore
      result = await extractCircledWords(image, apiKeys, {});
    } else {
      // Note: eikenLevel is NOT used for 'all' mode anymore (use 'eiken' mode instead)
      // Examples are generated in prefill flow to avoid duplicate AI generation costs.
      result = await extractWords(image, apiKeys, {
        includeExamples: false,
      });
    }
    aiExtractionMs = Date.now() - aiStart;

    if (!result.success) {
      // 抽出が完全に失敗したスキャンはコインを返還する
      if (coinScanRef) {
        await refundScanCoinsForJob(coinScanRef);
      }
      coinScanRef = null;
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }
    result = {
      ...result,
      data: {
        ...result.data,
        words: applySourceModesFromScanModes(result.data.words, modes),
      },
    };

    // ============================================
    // 5. RETURN SUCCESS RESPONSE
    // ============================================
    // ユーザの興味ジャンル（例文パーソナライズ用・Pro限定）。非Pro/取得失敗時は空配列で続行。
    // ジャンル指定ユーザはマスター例文を読み込まず、毎回ジャンル別に生成する。
    const exampleGenres = await fetchExampleGenresForProUser(supabase, user.id);
    const masterFirstEnabled = isMasterFirstResolutionEnabledForModes(modes);
    const resolved = masterFirstEnabled
      ? await resolveImmediateWords(result.data.words, undefined, {
          skipMasterExamples: exampleGenres.length > 0,
        })
      : null;
    const rollbackResult = masterFirstEnabled
      ? null
      : await backfillWords(result.data.words);
    const extractedWords = applySourceModesFromScanModes(
      resolved?.words ?? rollbackResult?.words ?? result.data.words,
      modes,
    ).map((word) => normalizeWordForTranslationPersistence(word));
    const aiJapaneseCount = extractedWords.filter((word) => word.japaneseSource === 'ai').length;

    console.log('[extract] Extraction done', {
      modes,
      primaryMode,
      masterFirstEnabled,
      wordCount: extractedWords.length,
      masterHitCount: resolved?.metrics.masterHitCount ?? 0,
      masterTranslationHitCount: resolved?.metrics.masterTranslationHitCount ?? 0,
      aiJapaneseCount,
      masterLookupKeyCount: resolved?.metrics.lookupKeyCount ?? 0,
      masterLookupElapsedMs: resolved?.metrics.lookupElapsedMs ?? 0,
      translationElapsedMs: resolved?.metrics.translationElapsedMs ?? 0,
      elapsedMs: Date.now() - startedAt,
    });

    // --- Synchronous example sentence generation ---
    const exampleGenDiag: {
      attempted: boolean;
      wordsRequested: number;
      wordsGenerated: number;
      error?: string;
      elapsedMs?: number;
    } = { attempted: false, wordsRequested: 0, wordsGenerated: 0 };

    // AI生成が有効なユーザーは保存後のクイズprefill（30語/バッチ）が
    // 多肢選択語の例文を生成するため、1語1コールの同期例文生成は
    // 語順クイズ対象語（prefill対象外）のみに限定して二重生成を防ぐ。
    // AI生成が無効なユーザーはprefillが走らないので従来どおり全語生成する。
    const aiGenerationEnabled = await fetchAiGeneration(supabase, user.id);
    const wordsNeedingExamples = extractedWords
      .map((w: { english?: string; japanese?: string; exampleSentence?: string }, i: number) => ({
        id: String(i),
        english: String((w as Record<string, unknown>).english ?? ''),
        japanese: String((w as Record<string, unknown>).japanese ?? ''),
        exampleSentence: (w as Record<string, unknown>).exampleSentence as string | undefined,
      }))
      .filter((w) => !w.exampleSentence && w.english.length > 0)
      .filter((w) => !aiGenerationEnabled || isWordOrderEligible(w));

    if (wordsNeedingExamples.length > 0) {
      exampleGenDiag.attempted = true;
      exampleGenDiag.wordsRequested = wordsNeedingExamples.length;
      const exGenStart = Date.now();

      try {
        const exampleResult = await generateExamples(wordsNeedingExamples, apiKeys, { genres: exampleGenres });
        const exampleMap = new Map(exampleResult.examples.map((ex) => [ex.wordId, ex]));

        extractedWords.forEach((word, index) => {
          const w = word as Record<string, unknown>;
          const generated = exampleMap.get(String(index));
          if (!generated || w.exampleSentence) return;
          w.exampleSentence = generated.exampleSentence;
          w.exampleSentenceJa = generated.exampleSentenceJa;
          if (!Array.isArray(w.partOfSpeechTags) || (w.partOfSpeechTags as string[]).length === 0) {
            w.partOfSpeechTags = generated.partOfSpeechTags;
          }
        });

        exampleGenDiag.wordsGenerated = exampleResult.examples.length;
        exampleGenDiag.elapsedMs = Date.now() - exGenStart;

        if (exampleResult.errors.length > 0) {
          exampleGenDiag.error = exampleResult.errors.join('; ');
        }

        console.log('[extract] Example generation completed', {
          requested: wordsNeedingExamples.length,
          generated: exampleResult.examples.length,
          errors: exampleResult.errors.length,
          elapsedMs: Date.now() - exGenStart,
        });

        // Save examples to lexicon master (best-effort, non-blocking).
        // ジャンル指定で個人向けに生成した例文は共有マスターには書き込まない。
        try {
          if (exampleGenres.length === 0 && resolved?.lexiconEntries && resolved.lexiconEntries.length > 0) {
            const lexiconMap = new Map(resolved.lexiconEntries.map(le => [le.headword.toLowerCase(), le.id]));
            const lexiconUpdates = extractedWords
              .filter((w): w is typeof w & { english: string; exampleSentence: string } => {
                return Boolean(w.exampleSentence && w.english);
              })
              .map((w) => {
                const lexId = lexiconMap.get(String(w.english).toLowerCase());
                if (!lexId) return null;
                return {
                  lexiconEntryId: lexId,
                  exampleSentence: w.exampleSentence,
                  exampleSentenceJa: w.exampleSentenceJa || '',
                };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);

            if (lexiconUpdates.length > 0) {
              await saveExamples(lexiconUpdates);
            }
          }
        } catch (lexSaveError) {
          console.error('[extract] Lexicon example save failed (non-critical):', lexSaveError);
        }
      } catch (exampleError) {
        exampleGenDiag.error = exampleError instanceof Error ? exampleError.message : 'Unknown error';
        exampleGenDiag.elapsedMs = Date.now() - exGenStart;
        console.error('[extract] Example generation failed, continuing without:', exampleError);
      }
    }

    // --- Morphology (語源解析) generation: opt-in, best-effort ---
    if (includeMorphology && extractedWords.length > 0) {
      const morphStart = Date.now();
      try {
        const morphologyMap = await resolveMorphology(
          extractedWords
            .map((w) => ({ english: String((w as Record<string, unknown>).english ?? '') }))
            .filter((w) => w.english.length > 0),
          apiKeys,
        );
        let attachedCount = 0;
        for (const word of extractedWords) {
          const w = word as Record<string, unknown>;
          const english = String(w.english ?? '');
          if (!english) continue;
          const morphology = morphologyMap.get(normalizeHeadword(english));
          if (hasDisplayableMorphology(morphology)) {
            w.morphology = morphology;
            attachedCount++;
          }
        }
        console.log('[extract] Morphology generation completed', {
          requested: extractedWords.length,
          attached: attachedCount,
          elapsedMs: Date.now() - morphStart,
        });
      } catch (morphologyError) {
        console.error('[extract] Morphology generation failed (non-critical):', morphologyError);
      }
    }

    return NextResponse.json({
      success: true,
      words: extractedWords,
      sourceLabels: ensureSourceLabels(result.data.sourceLabels),
      lexiconEntries: resolved?.lexiconEntries ?? [],
      scanInfo: {
        currentCount: scanGateInfo.currentCount,
        limit: scanGateInfo.limit,
        isPro: scanGateInfo.isPro,
      },
      // フラグオフ時（null）はキー自体を出さず、従来のレスポンスと同一形状を保つ
      ...(coinInfo ? { coinInfo } : {}),
      _debug: {
        timing: {
          totalMs: Date.now() - startedAt,
          aiExtractionMs,
          lexiconResolutionMs: 0,
          exampleGenerationMs: 0,
        },
      },
    });
  } catch (error) {
    console.error('Extract API error:', error);
    // 消費後に到達した予期しない失敗（500 = ユーザーは何も得ていない）は返還する
    if (coinScanRef) {
      await refundScanCoinsForJob(coinScanRef);
    }
    // タイムアウト・通信障害など原因が分かる場合は理由の伝わる日本語文言を返す
    // （内部エラーの英語メッセージはそのまま出さない）
    return NextResponse.json(
      { success: false, error: toUserFacingScanErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // スキャン1回分のAI呼び出し（抽出・翻訳補完・例文生成）を
  // 同じ scan_id で api_cost_events に紐づける。
  return runWithApiCostScanContext(
    { source: 'api/extract' },
    () => handleExtractPost(request)
  );
}
