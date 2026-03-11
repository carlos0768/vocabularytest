import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  EIKEN_OCR_PROMPT,
  EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT,
  EIKEN_WORD_ANALYSIS_USER_PROMPT,
  EIKEN_LEVEL_DESCRIPTIONS,
  getEikenLevelsAbove,
} from './prompts';
import { AI_CONFIG } from './config';
import { AIError, getProviderFromConfig } from './providers';
import { extractWordsFromImage as extractWordsFromImageBase } from './extract-words';
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
  // Validate input
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.error('Invalid imageBase64:', typeof imageBase64, imageBase64?.length);
    return { success: false, error: '画像データが無効です' };
  }

  // Remove data URL prefix if present and validate
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

  // Validate base64 data
  if (!base64Data || base64Data.length === 0) {
    console.error('Empty base64 data');
    return { success: false, error: '画像データが空です' };
  }

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
        temperature: 1.0,
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

    // Parse JSON response
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonContent(content));
    } catch {
      console.error('Failed to parse GPT response:', content);
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

    return { success: true, data: validated.data! };
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
 * Full pipeline: Extract text and analyze words at specified EIKEN level
 */
export async function extractEikenWordsFromImage(
  imageBase64: string,
  apiKeys: ProviderApiKeys,
  eikenLevel: EikenLevel,
  deps: EikenDeps = {}
): Promise<EikenExtractionResult> {
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
        console.log(`EIKEN fallback success (unfiltered extraction): extracted ${fallbackResult.data.words.length} words`);
        return {
          success: true,
          extractedText: ocrResult.text,
          data: {
            ...fallbackResult.data,
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
