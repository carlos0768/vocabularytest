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
  | { success: false; error: string };

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

    // Check if any idioms were extracted
    if (validated.data!.words.length === 0) {
      return {
        success: false,
        error: '画像から熟語・イディオムを読み取れませんでした。熟語が含まれる画像を撮影してください。',
      };
    }

    return { success: true, data: validated.data! };
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
