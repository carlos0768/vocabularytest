import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  IDIOM_EXTRACTION_SYSTEM_PROMPT,
  IDIOM_USER_PROMPT,
} from './prompts';
import { AI_CONFIG } from './config';
import { getProvider, AIError } from './providers';
import { prepareImageForProvider } from './utils/image';
import { safeParseJSON } from './utils/json';

export type IdiomExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string; reason?: 'no_idiom_found' };

const VERB_HINTS = new Set([
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'do', 'does', 'did', 'done',
  'have', 'has', 'had',
  'get', 'got', 'make', 'take', 'give', 'put', 'set',
  'look', 'feel', 'issue', 'come', 'go', 'keep', 'turn', 'work', 'pay', 'run',
  'call', 'bring', 'carry', 'pick', 'check', 'figure', 'point',
]);

const SUBJECT_STARTERS = new Set([
  'i', 'you', 'he', 'she', 'we', 'they', 'it', 'this', 'that', 'these', 'those',
]);

function normalizeExpression(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isStrictVerbIdiom(expression: string): boolean {
  const normalized = normalizeExpression(expression);
  if (!normalized) return false;
  if (/[.!?]/.test(normalized)) return false;

  const tokens = normalized.split(' ');
  if (tokens.length < 2 || tokens.length > 6) return false;
  if (SUBJECT_STARTERS.has(tokens[0])) return false;

  const hasVerbLikeToken = tokens.some((token) =>
    VERB_HINTS.has(token) ||
    (token.endsWith('ing') && token.length > 4) ||
    (token.endsWith('ed') && token.length > 3)
  );

  return hasVerbLikeToken;
}

// Extracts idioms and phrases from an image using AI provider (configured in config.ts)
// Returns validated word data (using same schema as words) or an error message
export async function extractIdiomsFromImage(
  imageBase64: string,
  apiKey: string
): Promise<IdiomExtractionResult> {
  // Validate input
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.error('Invalid imageBase64:', typeof imageBase64, imageBase64?.length);
    return { success: false, error: '画像データが無効です' };
  }

  // Validate data URL format
  if (imageBase64.startsWith('data:') && !imageBase64.includes(',')) {
    console.error('Invalid data URL format: no comma found');
    return { success: false, error: '画像データの形式が不正です' };
  }

  const config = AI_CONFIG.extraction.idioms;
  console.log('AI API call (idioms):', {
    provider: config.provider,
    model: config.model,
    imageLength: imageBase64.length,
    startsWithData: imageBase64.startsWith('data:')
  });

  const provider = getProvider(config.provider, apiKey);

  // Prepare image for provider
  const image = prepareImageForProvider(imageBase64);

  try {
    const response = await provider.generate({
      systemPrompt: IDIOM_EXTRACTION_SYSTEM_PROMPT,
      prompt: IDIOM_USER_PROMPT,
      image,
      config: {
        ...config,
        responseFormat: 'json',
      },
    });

    if (!response.success) {
      return { success: false, error: response.error || '画像を読み取れませんでした' };
    }

    const content = response.content;

    if (!content) {
      return { success: false, error: '画像を読み取れませんでした' };
    }

    // Parse JSON response
    const parseResult = safeParseJSON(content);
    if (!parseResult.success) {
      console.error('JSON parse error:', parseResult.error);
      return { success: false, error: 'AIの応答を解析できませんでした' };
    }

    // Validate with Zod schema (uses same schema as words)
    const validated = parseAIResponse(parseResult.data);

    if (!validated.success) {
      return {
        success: false,
        error: validated.error || 'データ形式が不正です',
      };
    }

    const strictWords = validated.data!.words.filter((word) => isStrictVerbIdiom(word.english));

    if (strictWords.length !== validated.data!.words.length) {
      console.log('Idiom strict filter applied:', {
        before: validated.data!.words.length,
        after: strictWords.length,
      });
    }

    // Check if any idioms were extracted
    if (strictWords.length === 0) {
      console.warn('Idiom extraction returned valid JSON but no idioms were found');
      return {
        success: false,
        error: '画像から熟語・イディオムを読み取れませんでした。',
        reason: 'no_idiom_found',
      };
    }

    return {
      success: true,
      data: {
        ...validated.data!,
        words: strictWords,
      },
    };
  } catch (error) {
    console.error('AI idiom extraction error:', error);

    // Handle AIError from provider
    if (error instanceof AIError) {
      return { success: false, error: error.message };
    }

    // Generic error - don't expose internal error message
    return {
      success: false,
      error: '画像の解析に失敗しました。もう一度お試しください。',
    };
  }
}
