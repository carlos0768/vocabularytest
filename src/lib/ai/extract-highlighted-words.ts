import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  parseHighlightedResponse,
  filterByConfidence,
  removeDuplicates,
  convertToStandardFormat,
  CONFIDENCE_THRESHOLD,
  type HighlightedResponse,
  type HighlightedWord,
} from '@/lib/schemas/highlighted-response';
import {
  HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT,
  HIGHLIGHTED_WORD_USER_PROMPT,
  HIGHLIGHTED_WORD_VERIFICATION_SYSTEM_PROMPT,
} from './prompts';
import { AI_CONFIG } from './config';
import { getProviderFromConfig } from './providers';

export type HighlightedExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

interface HighlightedExtractionDependencies {
  getProviderFromConfig: typeof getProviderFromConfig;
}

export interface HighlightedExtractionOptions {
  dependencies?: Partial<HighlightedExtractionDependencies>;
}

interface BoundingBox {
  y_min: number;
  x_min: number;
  y_max: number;
  x_max: number;
}

const UNDERLINE_HORIZONTAL_OVERLAP_THRESHOLD = 0.55;
const UNDERLINE_TOP_MARGIN_RATIO = 0.15;
const UNDERLINE_BOTTOM_MARGIN_RATIO = 0.3;
const HIGHLIGHT_HORIZONTAL_OVERLAP_THRESHOLD = 0.6;
const HIGHLIGHT_VERTICAL_OVERLAP_THRESHOLD = 0.5;
const HIGHLIGHT_INTERSECTION_RATIO_THRESHOLD = 0.35;
const RELAXED_CONFIDENCE_THRESHOLD = 0.65;

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

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function preferJapaneseSource(
  first?: string,
  second?: string,
): 'scan' | 'ai' | undefined {
  if (first === 'scan' || second === 'scan') return 'scan';
  if (first === 'ai' || second === 'ai') return 'ai';
  return undefined;
}

function parseHighlightedContent(content: string): {
  success: boolean;
  data?: HighlightedResponse;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonContent(content));
  } catch {
    return { success: false, error: 'AIの応答を解析できませんでした' };
  }

  return parseHighlightedResponse(parsed);
}

function parseVerificationContent(content: string): {
  success: boolean;
  data?: ValidatedAIResponse;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonContent(content));
  } catch {
    return { success: false, error: '検証応答を解析できませんでした' };
  }

  return parseAIResponse(parsed);
}

function isValidBoundingBox(box: BoundingBox | undefined): box is BoundingBox {
  if (!box) return false;
  return box.x_max > box.x_min && box.y_max > box.y_min;
}

function getWordBoundingBox(word: HighlightedWord): BoundingBox | undefined {
  const primary = word.wordBoundingBox;
  if (isValidBoundingBox(primary)) return primary;

  const legacy = word.boundingBox;
  if (isValidBoundingBox(legacy)) return legacy;

  return undefined;
}

function getMarkBoundingBox(word: HighlightedWord): BoundingBox | undefined {
  const mark = word.markBoundingBox;
  return isValidBoundingBox(mark) ? mark : undefined;
}

function horizontalOverlapRatio(wordBox: BoundingBox, markBox: BoundingBox): number {
  const overlapLeft = Math.max(wordBox.x_min, markBox.x_min);
  const overlapRight = Math.min(wordBox.x_max, markBox.x_max);
  const overlapWidth = Math.max(0, overlapRight - overlapLeft);
  const wordWidth = Math.max(1, wordBox.x_max - wordBox.x_min);
  return overlapWidth / wordWidth;
}

function verticalOverlapRatio(wordBox: BoundingBox, markBox: BoundingBox): number {
  const overlapTop = Math.max(wordBox.y_min, markBox.y_min);
  const overlapBottom = Math.min(wordBox.y_max, markBox.y_max);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);
  const wordHeight = Math.max(1, wordBox.y_max - wordBox.y_min);
  return overlapHeight / wordHeight;
}

function intersectionRatioOnWord(wordBox: BoundingBox, markBox: BoundingBox): number {
  const overlapLeft = Math.max(wordBox.x_min, markBox.x_min);
  const overlapRight = Math.min(wordBox.x_max, markBox.x_max);
  const overlapTop = Math.max(wordBox.y_min, markBox.y_min);
  const overlapBottom = Math.min(wordBox.y_max, markBox.y_max);

  const overlapWidth = Math.max(0, overlapRight - overlapLeft);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);
  const overlapArea = overlapWidth * overlapHeight;
  const wordArea = Math.max(1, (wordBox.x_max - wordBox.x_min) * (wordBox.y_max - wordBox.y_min));
  return overlapArea / wordArea;
}

function isUnderlineAligned(wordBox: BoundingBox, markBox: BoundingBox): boolean {
  const overlap = horizontalOverlapRatio(wordBox, markBox);
  if (overlap < UNDERLINE_HORIZONTAL_OVERLAP_THRESHOLD) {
    return false;
  }

  const wordTopY = wordBox.y_min;
  const wordBottomY = wordBox.y_max;
  const wordHeight = Math.max(1, wordBottomY - wordTopY);
  const markCenterY = (markBox.y_min + markBox.y_max) / 2;

  if (markCenterY <= wordTopY) {
    return false;
  }

  const minY = wordBottomY - wordHeight * UNDERLINE_TOP_MARGIN_RATIO;
  const maxY = wordBottomY + wordHeight * UNDERLINE_BOTTOM_MARGIN_RATIO;

  return markCenterY >= minY && markCenterY <= maxY;
}

function isHighlightAligned(wordBox: BoundingBox, markBox: BoundingBox): boolean {
  const horizontal = horizontalOverlapRatio(wordBox, markBox);
  if (horizontal < HIGHLIGHT_HORIZONTAL_OVERLAP_THRESHOLD) {
    return false;
  }

  const vertical = verticalOverlapRatio(wordBox, markBox);
  if (vertical < HIGHLIGHT_VERTICAL_OVERLAP_THRESHOLD) {
    return false;
  }

  const intersection = intersectionRatioOnWord(wordBox, markBox);
  if (intersection < HIGHLIGHT_INTERSECTION_RATIO_THRESHOLD) {
    return false;
  }

  return true;
}

function resolveMarkType(word: HighlightedWord): 'underline' | 'highlight' | 'unknown' {
  const declared = word.markType ?? 'unknown';
  if (declared !== 'unknown') {
    return declared;
  }

  const wordBox = getWordBoundingBox(word);
  const markBox = getMarkBoundingBox(word);
  if (!wordBox || !markBox) {
    return 'unknown';
  }

  if (isUnderlineAligned(wordBox, markBox)) {
    return 'underline';
  }
  if (isHighlightAligned(wordBox, markBox)) {
    return 'highlight';
  }

  return 'unknown';
}

function passesStrictHighlightRules(word: HighlightedWord): boolean {
  if (word.confidence < CONFIDENCE_THRESHOLD) {
    return false;
  }

  if (word.isHandDrawn === false) {
    return false;
  }

  const markType = resolveMarkType(word);
  if (markType === 'unknown') {
    return false;
  }

  if (markType === 'underline') {
    const wordBox = getWordBoundingBox(word);
    const markBox = getMarkBoundingBox(word);

    if (!wordBox || !markBox) {
      return false;
    }

    if (!isUnderlineAligned(wordBox, markBox)) {
      return false;
    }
  }

  if (markType === 'highlight') {
    const wordBox = getWordBoundingBox(word);
    const markBox = getMarkBoundingBox(word);

    if (!wordBox || !markBox) {
      return false;
    }

    if (!isHighlightAligned(wordBox, markBox)) {
      return false;
    }
  }

  return true;
}

function passesRelaxedHighlightRules(word: HighlightedWord): boolean {
  if (word.confidence < RELAXED_CONFIDENCE_THRESHOLD) {
    return false;
  }

  if (word.isHandDrawn === false) {
    return false;
  }

  const wordBox = getWordBoundingBox(word);
  const markBox = getMarkBoundingBox(word);
  const markType = resolveMarkType(word);

  if (wordBox && markBox) {
    return isUnderlineAligned(wordBox, markBox) || isHighlightAligned(wordBox, markBox);
  }

  // Allow high-confidence candidates when the model omitted bbox fields.
  if (word.confidence >= 0.9 && markType !== 'unknown') {
    return true;
  }

  return false;
}

function buildVerificationPrompt(words: HighlightedWord[]): string {
  const candidates = words
    .map((word, index) => (
      `${index + 1}. english=${JSON.stringify(word.english)}, japanese=${JSON.stringify(word.japanese)}, ` +
      `markType=${JSON.stringify(word.markType ?? 'unknown')}, markerColor=${JSON.stringify(word.markerColor ?? 'unknown')}`
    ))
    .join('\n');

  return `一次抽出候補です。画像を再確認し、条件を満たす候補だけを残してください。\n\n候補:\n${candidates}\n\n判定ルール:\n- 手書きのマーカー/下線が明確に確認できる候補のみ残す\n- 下線の場合は、線の真上にある単語のみ残す\n- 印刷赤字・印刷下線・下の行の単語は除外する\n- 候補リストにない単語は追加しない\n\n出力は次のJSONのみ:\n{\n  "words": [\n    {\n      "english": "word",\n      "japanese": "意味",\n      "japaneseSource": "scan"\n    }\n  ]\n}`;
}

function intersectVerifiedCandidates(
  candidates: HighlightedWord[],
  verifiedWords: ValidatedAIResponse['words']
): HighlightedWord[] {
  const verifiedMap = new Map(
    verifiedWords
      .map((word) => [normalizeText(word.english), word] as const)
      .filter(([english]) => english.length > 0)
  );

  return candidates.flatMap((word) => {
    const verified = verifiedMap.get(normalizeText(word.english));
    if (!verified) {
      return [];
    }

    return [{
      ...word,
      japaneseSource: preferJapaneseSource(word.japaneseSource, verified.japaneseSource),
    }];
  });
}

// Extracts only highlighted/marker words from an image using AI provider (Cloud Run or direct)
export async function extractHighlightedWordsFromImage(
  imageBase64: string,
  apiKeys: { gemini?: string; openai?: string },
  options: HighlightedExtractionOptions = {}
): Promise<HighlightedExtractionResult> {
  const { dependencies = {} } = options;

  // Validate input
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.error('Invalid imageBase64:', typeof imageBase64, imageBase64?.length);
    return { success: false, error: '画像データが無効です' };
  }

  // Remove data URL prefix if present and validate
  let base64Data: string;
  let mimeType = 'image/jpeg';

  if (imageBase64.startsWith('data:')) {
    // Parse data URL format: data:[<mediatype>][;base64],<data>
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

  console.log('AI API call (highlighted mode):', {
    mimeType,
    base64Length: base64Data.length,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
  });

  try {
    const config = AI_CONFIG.extraction.highlighted;
    const resolveProvider = dependencies.getProviderFromConfig ?? getProviderFromConfig;
    const provider = resolveProvider(config, apiKeys);

    const firstPassResult = await provider.generate({
      systemPrompt: HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT,
      prompt: HIGHLIGHTED_WORD_USER_PROMPT,
      image: { base64: base64Data, mimeType },
      config: {
        ...config,
        temperature: 0,
        maxOutputTokens: 8192,
        responseFormat: 'json',
      },
    });

    if (!firstPassResult.success) {
      return { success: false, error: firstPassResult.error };
    }

    if (!firstPassResult.content) {
      return { success: false, error: '画像を読み取れませんでした' };
    }

    const firstPassParsed = parseHighlightedContent(firstPassResult.content);
    if (!firstPassParsed.success || !firstPassParsed.data) {
      return {
        success: false,
        error: firstPassParsed.error || 'データ形式が不正です',
      };
    }

    const firstPassData = firstPassParsed.data;

    const strictCandidatesRaw = removeDuplicates(
      filterByConfidence(firstPassData.words, CONFIDENCE_THRESHOLD)
        .filter((word) => passesStrictHighlightRules(word))
    );
    const strictCandidates = strictCandidatesRaw.length > 0
      ? strictCandidatesRaw
      : removeDuplicates(
        filterByConfidence(firstPassData.words, RELAXED_CONFIDENCE_THRESHOLD)
          .filter((word) => passesRelaxedHighlightRules(word))
      );

    console.log('Highlighted strict filtering result:', {
      beforeFilter: firstPassData.words.length,
      afterStrictFilter: strictCandidatesRaw.length,
      afterFinalFilter: strictCandidates.length,
      usedRelaxedFallback: strictCandidatesRaw.length === 0 && strictCandidates.length > 0,
      threshold: CONFIDENCE_THRESHOLD,
      filteredOut: firstPassData.words.length - strictCandidatesRaw.length,
    });

    if (strictCandidates.length === 0) {
      if (firstPassData.words.length > 0) {
        return {
          success: false,
          error: `検出候補（${firstPassData.words.length}語）はありましたが、厳密判定を満たしませんでした。より鮮明に撮影して再度お試しください。`,
        };
      }

      return {
        success: false,
        error: 'マーカーやアンダーラインが引かれた単語が見つかりませんでした。蛍光マーカーで塗った単語、または手書きのペンで下線を引いた単語がある画像を撮影してください（印刷された下線は対象外です）。',
      };
    }

    const verificationResult = await provider.generate({
      systemPrompt: HIGHLIGHTED_WORD_VERIFICATION_SYSTEM_PROMPT,
      prompt: buildVerificationPrompt(strictCandidates),
      image: { base64: base64Data, mimeType },
      config: {
        ...config,
        temperature: 0,
        maxOutputTokens: Math.min(config.maxOutputTokens, 4096),
        responseFormat: 'json',
      },
    });

    if (!verificationResult.success) {
      return { success: false, error: verificationResult.error || '抽出候補の検証に失敗しました' };
    }

    if (!verificationResult.content) {
      return { success: false, error: '抽出候補の検証結果が空でした' };
    }

    const verificationParsed = parseVerificationContent(verificationResult.content);
    if (!verificationParsed.success || !verificationParsed.data) {
      return {
        success: false,
        error: verificationParsed.error || '抽出候補の検証に失敗しました',
      };
    }

    const verifiedCandidates = removeDuplicates(
      intersectVerifiedCandidates(strictCandidates, verificationParsed.data.words)
    );

    const minVerified = Math.max(1, Math.floor(strictCandidates.length * 0.4));
    const verificationTooAggressive = verifiedCandidates.length < minVerified;
    const finalCandidates = verificationTooAggressive ? strictCandidates : verifiedCandidates;

    console.log('Highlighted verification result:', {
      firstPassCandidates: strictCandidates.length,
      verifiedCandidates: verifiedCandidates.length,
      minVerified,
      verificationTooAggressive,
      finalCandidates: finalCandidates.length,
    });

    if (finalCandidates.length === 0) {
      return {
        success: false,
        error: '手書きマーカー・下線の条件を満たす単語が見つかりませんでした。',
      };
    }

    const standardFormat = convertToStandardFormat({
      ...firstPassData,
      words: finalCandidates,
    });

    return { success: true, data: standardFormat };
  } catch (error) {
    console.error('Gemini API error (highlighted mode):', error);

    // Handle specific errors
    if (error instanceof Error) {
      const errorMessage = error.message;
      console.error('Gemini error message:', errorMessage);

      if (errorMessage.includes('API key') || errorMessage.includes('API_KEY')) {
        return { success: false, error: 'Gemini APIキーが無効です' };
      }
      if (errorMessage.includes('quota') || errorMessage.includes('rate')) {
        return { success: false, error: 'API制限に達しました。しばらく待ってから再試行してください。' };
      }
      if (errorMessage.includes('did not match the expected pattern')) {
        console.error('Pattern mismatch error - likely invalid base64 or model issue');
        return { success: false, error: '画像データの処理に問題が発生しました。別の画像をお試しください。' };
      }
      if (errorMessage.includes('model') || errorMessage.includes('not found')) {
        console.error('Model not found error');
        return { success: false, error: 'AIモデルが利用できません。しばらく待ってから再試行してください。' };
      }
    }

    // Generic error - don't expose internal error message
    return {
      success: false,
      error: '画像の解析に失敗しました。もう一度お試しください。',
    };
  }
}
