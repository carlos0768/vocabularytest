import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  WORD_EXTRACTION_SYSTEM_PROMPT,
  USER_PROMPT_TEMPLATE,
  WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT,
  USER_PROMPT_WITH_EXAMPLES_TEMPLATE,
  getEikenFilterInstruction,
} from './prompts';
import { AI_CONFIG } from './config';
import { getProvider, AIError } from './providers';
import { prepareImageForProvider } from './utils/image';
import { safeParseJSON } from './utils/json';

export type ExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

export interface ExtractionOptions {
  includeExamples?: boolean; // Pro feature: include example sentences
  eikenLevel?: string | null; // EIKEN level filter
}

// Extracts words from an image using AI provider (configured in config.ts)
// Returns validated word data or an error message
export async function extractWordsFromImage(
  imageBase64: string,
  apiKey: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
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

  const config = AI_CONFIG.extraction.words;
  console.log('AI API call (words):', {
    provider: config.provider,
    model: config.model,
    imageLength: imageBase64.length,
    startsWithData: imageBase64.startsWith('data:')
  });

  const provider = getProvider(config.provider, apiKey);
  const { includeExamples = false, eikenLevel = null } = options;

  // Select prompts based on whether examples are requested (Pro feature)
  const baseSystemPrompt = includeExamples
    ? WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT
    : WORD_EXTRACTION_SYSTEM_PROMPT;

  // Add EIKEN filter instruction if level is specified
  const eikenInstruction = getEikenFilterInstruction(eikenLevel);
  const systemPrompt = baseSystemPrompt + eikenInstruction;

  const userPrompt = includeExamples
    ? USER_PROMPT_WITH_EXAMPLES_TEMPLATE
    : USER_PROMPT_TEMPLATE;

  // Prepare image for provider
  const image = prepareImageForProvider(imageBase64);

  try {
    const response = await provider.generate({
      systemPrompt,
      prompt: userPrompt,
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
      console.error('Raw content (first 500 chars):', content.slice(0, 500));
      console.error('Raw content (last 500 chars):', content.slice(-500));
      return { success: false, error: 'AIの応答を解析できませんでした' };
    }

    // Validate with Zod schema
    const validated = parseAIResponse(parseResult.data);

    if (!validated.success) {
      return {
        success: false,
        error: validated.error || 'データ形式が不正です',
      };
    }

    // Check if any words were extracted
    if (validated.data!.words.length === 0) {
      return {
        success: false,
        error: '画像から単語を読み取れませんでした。もう一度撮影してください。',
      };
    }

    return { success: true, data: validated.data! };
  } catch (error) {
    console.error('AI extraction error:', error);

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
