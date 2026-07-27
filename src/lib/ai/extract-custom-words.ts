import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  buildCustomExtractionSystemPrompt,
  buildCustomExtractionUserPrompt,
} from './prompts/custom';
import { normalizeCustomScanModePrompt } from '@/lib/scan/custom-modes';
import { AI_CONFIG } from './config';
import { getProviderFromConfig, AIError } from './providers';
import { prepareImageForProvider } from './utils/image';
import { safeParseJSON } from './utils/json';

export type CustomExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

export interface CustomExtractionOptions {
  /** ユーザが書いた「どの単語を抽出するか」の指示文 */
  customPrompt: string;
}

// ユーザ定義プロンプト（カスタム抽出モード）で画像から単語を抽出する。
// 抽出条件だけがユーザ由来で、JSON契約・訳ルールはテンプレート側が固定する。
export async function extractCustomWordsFromImage(
  imageBase64: string,
  apiKeys: { gemini?: string; openai?: string },
  options: CustomExtractionOptions,
): Promise<CustomExtractionResult> {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.error('Invalid imageBase64:', typeof imageBase64, imageBase64?.length);
    return { success: false, error: '画像データが無効です' };
  }

  if (imageBase64.startsWith('data:') && !imageBase64.includes(',')) {
    console.error('Invalid data URL format: no comma found');
    return { success: false, error: '画像データの形式が不正です' };
  }

  const instruction = normalizeCustomScanModePrompt(options.customPrompt);
  if (!instruction) {
    return { success: false, error: '抽出プロンプトが設定されていません' };
  }

  const config = AI_CONFIG.extraction.words;
  console.log('AI API call (custom extraction):', {
    provider: config.provider,
    model: config.model,
    promptLength: instruction.length,
    imageLength: imageBase64.length,
    startsWithData: imageBase64.startsWith('data:'),
  });

  const provider = getProviderFromConfig(config, apiKeys);
  const image = prepareImageForProvider(imageBase64);

  try {
    const response = await provider.generate({
      systemPrompt: buildCustomExtractionSystemPrompt(instruction),
      prompt: buildCustomExtractionUserPrompt(instruction),
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

    const parseResult = safeParseJSON(content);
    if (!parseResult.success) {
      console.error('JSON parse error:', parseResult.error);
      console.error('Raw content (first 500 chars):', content.slice(0, 500));
      return { success: false, error: 'AIの応答を解析できませんでした' };
    }

    // AI出力は必ずZodで検証する（INV-08）
    const validated = parseAIResponse(parseResult.data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error || 'データ形式が不正です',
      };
    }

    if (validated.data!.words.length === 0) {
      return {
        success: false,
        error: '指定した条件に合う単語が見つかりませんでした。プロンプトを見直すか、別の写真をお試しください。',
      };
    }

    return { success: true, data: validated.data! };
  } catch (error) {
    console.error('AI custom extraction error:', error);

    if (error instanceof AIError) {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: '画像の解析に失敗しました。もう一度お試しください。',
    };
  }
}
