import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  EIKEN_OCR_PROMPT,
  EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT,
  EIKEN_WORD_ANALYSIS_USER_PROMPT,
  EIKEN_SINGLE_PASS_SYSTEM_PROMPT,
  EIKEN_SINGLE_PASS_USER_PROMPT,
  EIKEN_LEVEL_DESCRIPTIONS,
  getEikenLevelsAbove,
} from './prompts';
import { AI_CONFIG } from './config';
import { AIError, getProviderFromConfig } from './providers';
import { extractWordsFromImage as extractWordsFromImageBase } from './extract-words';
import { filterWordsByLexiconCefrLevel } from '@/lib/lexicon/eiken-cefr-filter';
import type { EikenLevel } from '@/app/api/extract/route';
import { mergeSourceLabels, normalizeSourceLabels } from '../../../shared/source-labels';

// Result type for OCR extraction
export type EikenOCRResult =
  | { success: true; text: string; sourceLabels: string[] }
  | { success: false; error: string };

// Result type for word analysis
export type EikenWordAnalysisResult =
  | { success: true; data: ValidatedAIResponse }
  | {
      success: false;
      error: string;
      reason?: 'invalid_json' | 'invalid_format' | 'no_words_found' | 'unknown';
    };

// Combined result for the full pipeline
export type EikenExtractionResult =
  | { success: true; extractedText: string; data: ValidatedAIResponse }
  | { success: false; error: string };

interface ProviderApiKeys {
  gemini?: string;
  openai?: string;
}

interface EikenDeps {
  getProviderFromConfig?: typeof getProviderFromConfig;
  extractWordsFromImage?: typeof extractWordsFromImageBase;
  filterWordsByCefrLevel?: typeof filterWordsByLexiconCefrLevel;
  /** 1段抽出(画像→単語を1回の呼び出しで)を使うか。未指定時は EIKEN_SINGLE_PASS_EXTRACTION=1 で有効。 */
  singlePassExtraction?: boolean;
}

type ParsedImageInput =
  | { success: true; base64Data: string; mimeType: string }
  | { success: false; error: string };

function parseImageInput(imageBase64: string): ParsedImageInput {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.error('Invalid imageBase64:', typeof imageBase64, imageBase64?.length);
    return { success: false, error: '画像データが無効です' };
  }

  let base64Data: string;
  let mimeType = 'image/jpeg';

  if (imageBase64.startsWith('data:')) {
    const commaIndex = imageBase64.indexOf(',');
    if (commaIndex === -1) {
      console.error('Invalid data URL format: no comma found');
      return { success: false, error: '画像データの形式が不正です' };
    }

    base64Data = imageBase64.slice(commaIndex + 1);
    const headerMatch = imageBase64.slice(0, commaIndex).match(/^data:([^;]+)/);
    if (headerMatch) {
      mimeType = headerMatch[1];
    }
  } else {
    base64Data = imageBase64;
  }

  if (!base64Data || base64Data.length === 0) {
    console.error('Empty base64 data');
    return { success: false, error: '画像データが空です' };
  }

  return { success: true, base64Data, mimeType };
}

function extractJsonContent(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  const jsonStartIndex = content.indexOf('{');
  const jsonEndIndex = content.lastIndexOf('}');
  if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
    return content.slice(jsonStartIndex, jsonEndIndex + 1);
  }

  return content;
}

function parseEikenOCRContent(content: string): { text: string; sourceLabels: string[] } {
  const trimmed = content.trim();
  const jsonContent = extractJsonContent(trimmed);

  try {
    const parsed = JSON.parse(jsonContent) as {
      text?: unknown;
      sourceLabels?: Iterable<unknown> | null;
    };
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';

    if (text) {
      return {
        text,
        sourceLabels: normalizeSourceLabels(parsed.sourceLabels),
      };
    }
  } catch {
    // Legacy plain-text OCR responses are still accepted as a fallback.
  }

  return {
    text: trimmed,
    sourceLabels: [],
  };
}

/**
 * Step 1: Extract text from image
 */
export async function extractTextForEiken(
  imageBase64: string,
  apiKeys: ProviderApiKeys,
  deps: EikenDeps = {}
): Promise<EikenOCRResult> {
  const parsedImage = parseImageInput(imageBase64);
  if (!parsedImage.success) {
    return parsedImage;
  }
  const { base64Data, mimeType } = parsedImage;

  console.log('AI OCR for EIKEN:', { mimeType, base64Length: base64Data.length });

  try {
    const config = AI_CONFIG.extraction.eiken;
    const resolveProvider = deps.getProviderFromConfig ?? getProviderFromConfig;
    const provider = resolveProvider(config, apiKeys);

    const result = await provider.generate({
      prompt: EIKEN_OCR_PROMPT,
      image: { base64: base64Data, mimeType },
      config: {
        ...config,
        temperature: 0.0,
        maxOutputTokens: config.maxOutputTokens,
      },
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const rawContent = result.content?.trim();

    if (!rawContent) {
      return { success: false, error: '画像からテキストを読み取れませんでした' };
    }

    const parsed = parseEikenOCRContent(rawContent);
    if (!parsed.text) {
      return { success: false, error: '画像からテキストを読み取れませんでした' };
    }

    return { success: true, text: parsed.text, sourceLabels: parsed.sourceLabels };
  } catch (error) {
    console.error('AI OCR error:', error);

    if (error instanceof AIError) {
      return { success: false, error: error.getUserMessage() };
    }

    return {
      success: false,
      error: '画像の読み取りに失敗しました。もう一度お試しください。',
    };
  }
}

/**
 * Step 2: Analyze text and extract words at specified EIKEN level
 */
export async function analyzeWordsForEiken(
  text: string,
  apiKeys: ProviderApiKeys,
  eikenLevel: EikenLevel,
  deps: EikenDeps = {}
): Promise<EikenWordAnalysisResult> {
  if (!text || text.trim().length === 0) {
    return { success: false, error: '解析するテキストがありません' };
  }

  if (!eikenLevel) {
    return { success: false, error: '英検レベルを指定してください' };
  }

  const levelDesc = EIKEN_LEVEL_DESCRIPTIONS[eikenLevel];
  if (!levelDesc) {
    return { success: false, error: '無効な英検レベルです' };
  }

  // Build prompts with level filter
  const levelsAbove = getEikenLevelsAbove(eikenLevel);
  const levelRange = levelsAbove.map(level => EIKEN_LEVEL_DESCRIPTIONS[level]).join('、');
  const systemPrompt = EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT
    .replace('{LEVEL_DESC}', levelDesc)
    .replace('{LEVEL_RANGE}', levelRange);
  const userPrompt = EIKEN_WORD_ANALYSIS_USER_PROMPT + text;
  const config = AI_CONFIG.extraction.eiken;

  console.log('GPT Word analysis for EIKEN:', {
    textLength: text.length,
    eikenLevel,
    model: config.model,
  });

  try {
    const resolveProvider = deps.getProviderFromConfig ?? getProviderFromConfig;
    const provider = resolveProvider(config, apiKeys);
    const response = await provider.generate({
      systemPrompt,
      prompt: userPrompt,
      config: {
        ...config,
        // レベル分類の一貫性のため決定的に(configの0.7は抽出系の既定値)
        temperature: 0.0,
        responseFormat: 'json',
      },
    });

    if (!response.success) {
      return { success: false, error: response.error, reason: 'unknown' };
    }

    const content = response.content?.trim();
    if (!content) {
      return { success: false, error: '単語解析の結果を取得できませんでした', reason: 'unknown' };
    }

    return await finalizeEikenAnalysis(content, eikenLevel, levelDesc, deps);
  } catch (error) {
    console.error('AI word analysis error:', error);

    if (error instanceof AIError) {
      return { success: false, error: error.getUserMessage(), reason: 'unknown' };
    }

    return {
      success: false,
      error: '単語解析に失敗しました。もう一度お試しください。',
      reason: 'unknown',
    };
  }
}

/**
 * Shared tail of the EIKEN analysis: parse JSON -> validate -> deterministic CEFR filter.
 */
async function finalizeEikenAnalysis(
  content: string,
  eikenLevel: NonNullable<EikenLevel>,
  levelDesc: string,
  deps: EikenDeps
): Promise<EikenWordAnalysisResult> {
  // Parse JSON response
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonContent(content));
  } catch {
    console.error('Failed to parse EIKEN analysis response:', content);
    return { success: false, error: 'AIの応答を解析できませんでした', reason: 'invalid_json' };
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    !Object.prototype.hasOwnProperty.call(parsed, 'words')
  ) {
    console.warn('EIKEN analysis response missing "words" key');
  }

  // Validate with Zod schema
  const validated = parseAIResponse(parsed);

  if (!validated.success) {
    return {
      success: false,
      error: validated.error || 'データ形式が不正です',
      reason: 'invalid_format',
    };
  }

  // Check if any words were extracted
  if (validated.data!.words.length === 0) {
    return {
      success: false,
      error: `${levelDesc}に該当する単語が見つかりませんでした。別の画像をお試しください。`,
      reason: 'no_words_found',
    };
  }

  // AIのレベル判定は不安定なため、lexiconのCEFRレベルで指定級未満の単語を決定的に除外する
  const filterWords = deps.filterWordsByCefrLevel ?? filterWordsByLexiconCefrLevel;
  const filtered = await filterWords(validated.data!.words, eikenLevel);
  if (filtered.removedCount > 0) {
    console.log('EIKEN lexicon CEFR filter removed words below level', {
      eikenLevel,
      removedCount: filtered.removedCount,
      unknownCount: filtered.unknownCount,
      remainingCount: filtered.words.length,
    });
  }

  if (filtered.words.length === 0) {
    return {
      success: false,
      error: `${levelDesc}に該当する単語が見つかりませんでした。別の画像をお試しください。`,
      reason: 'no_words_found',
    };
  }

  return { success: true, data: { ...validated.data!, words: filtered.words } };
}

/**
 * Single-pass extraction (experimental): image -> level-filtered words in one call.
 * Enabled via EIKEN_SINGLE_PASS_EXTRACTION=1 or deps.singlePassExtraction.
 */
export async function extractEikenWordsSinglePass(
  imageBase64: string,
  apiKeys: ProviderApiKeys,
  eikenLevel: NonNullable<EikenLevel>,
  deps: EikenDeps = {}
): Promise<EikenWordAnalysisResult> {
  const levelDesc = EIKEN_LEVEL_DESCRIPTIONS[eikenLevel];
  if (!levelDesc) {
    return { success: false, error: '無効な英検レベルです', reason: 'unknown' };
  }

  const parsedImage = parseImageInput(imageBase64);
  if (!parsedImage.success) {
    return { success: false, error: parsedImage.error, reason: 'unknown' };
  }

  const levelsAbove = getEikenLevelsAbove(eikenLevel);
  const levelRange = levelsAbove.map(level => EIKEN_LEVEL_DESCRIPTIONS[level]).join('、');
  const systemPrompt = EIKEN_SINGLE_PASS_SYSTEM_PROMPT
    .replace('{LEVEL_DESC}', levelDesc)
    .replace('{LEVEL_RANGE}', levelRange);
  const config = AI_CONFIG.extraction.eiken;

  console.log('Single-pass word extraction for EIKEN:', {
    eikenLevel,
    model: config.model,
    base64Length: parsedImage.base64Data.length,
  });

  try {
    const resolveProvider = deps.getProviderFromConfig ?? getProviderFromConfig;
    const provider = resolveProvider(config, apiKeys);
    const response = await provider.generate({
      systemPrompt,
      prompt: EIKEN_SINGLE_PASS_USER_PROMPT,
      image: { base64: parsedImage.base64Data, mimeType: parsedImage.mimeType },
      config: {
        ...config,
        temperature: 0.0,
        responseFormat: 'json',
      },
    });

    if (!response.success) {
      return { success: false, error: response.error, reason: 'unknown' };
    }

    const content = response.content?.trim();
    if (!content) {
      return { success: false, error: '単語解析の結果を取得できませんでした', reason: 'unknown' };
    }

    return await finalizeEikenAnalysis(content, eikenLevel, levelDesc, deps);
  } catch (error) {
    console.error('EIKEN single-pass extraction error:', error);

    if (error instanceof AIError) {
      return { success: false, error: error.getUserMessage(), reason: 'unknown' };
    }

    return {
      success: false,
      error: '単語解析に失敗しました。もう一度お試しください。',
      reason: 'unknown',
    };
  }
}

/**
 * Full pipeline: Extract text and analyze words at specified EIKEN level
 */
export async function extractEikenWordsFromImage(
  imageBase64: string,
  apiKeys: ProviderApiKeys,
  eikenLevel: EikenLevel,
  deps: EikenDeps = {}
): Promise<EikenExtractionResult> {
  // Experimental single-pass path: one multimodal call instead of OCR + analysis.
  const useSinglePass =
    deps.singlePassExtraction ?? process.env.EIKEN_SINGLE_PASS_EXTRACTION === '1';

  if (useSinglePass && eikenLevel) {
    const singleResult = await extractEikenWordsSinglePass(imageBase64, apiKeys, eikenLevel, deps);

    if (singleResult.success) {
      return { success: true, extractedText: '', data: singleResult.data };
    }

    // 「該当語なし」は確定結果。それ以外の失敗は2段パイプラインへフォールバックする。
    if (singleResult.reason === 'no_words_found') {
      return singleResult;
    }

    console.warn('EIKEN single-pass extraction failed, falling back to two-stage pipeline', {
      reason: singleResult.reason,
      eikenLevel,
    });
  }

  // Step 1: OCR
  const ocrResult = await extractTextForEiken(imageBase64, apiKeys, deps);

  if (!ocrResult.success) {
    return ocrResult;
  }

  // Step 2: Word analysis
  const analysisResult = await analyzeWordsForEiken(
    ocrResult.text,
    apiKeys,
    eikenLevel,
    deps
  );

  if (!analysisResult.success) {
    const shouldFallback =
      analysisResult.reason === 'invalid_format' ||
      analysisResult.reason === 'invalid_json';

    if (shouldFallback) {
      console.warn('EIKEN two-stage extraction fallback triggered', {
        reason: analysisResult.reason,
        textLength: ocrResult.text.length,
        eikenLevel,
      });

      const extractWords = deps.extractWordsFromImage ?? extractWordsFromImageBase;
      const fallbackResult = await extractWords(imageBase64, apiKeys, {
        includeExamples: false,
      });

      if (fallbackResult.success && fallbackResult.data.words.length > 0) {
        // フォールバックはAIのレベルフィルタを通っていないため、lexiconベースの除外だけは必ずかける
        const filterWords = deps.filterWordsByCefrLevel ?? filterWordsByLexiconCefrLevel;
        const filtered = await filterWords(fallbackResult.data.words, eikenLevel);
        console.log(`EIKEN fallback success (lexicon-filtered extraction): extracted ${fallbackResult.data.words.length} words, removed ${filtered.removedCount} below level`);

        if (filtered.words.length === 0) {
          return {
            success: false,
            error: `${(eikenLevel && EIKEN_LEVEL_DESCRIPTIONS[eikenLevel]) || '指定レベル'}に該当する単語が見つかりませんでした。別の画像をお試しください。`,
          };
        }

        return {
          success: true,
          extractedText: ocrResult.text,
          data: {
            ...fallbackResult.data,
            words: filtered.words,
            sourceLabels: mergeSourceLabels(
              ocrResult.sourceLabels,
              fallbackResult.data.sourceLabels
            ),
          },
        };
      }

      if (!fallbackResult.success) {
        return fallbackResult;
      }
    }

    return analysisResult;
  }

  return {
    success: true,
    extractedText: ocrResult.text,
    data: {
      ...analysisResult.data,
      sourceLabels: mergeSourceLabels(ocrResult.sourceLabels, analysisResult.data.sourceLabels),
    },
  };
}
