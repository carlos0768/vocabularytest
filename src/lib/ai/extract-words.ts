import OpenAI from 'openai';
import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  WORD_EXTRACTION_SYSTEM_PROMPT,
  USER_PROMPT_TEMPLATE,
  WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT,
  USER_PROMPT_WITH_EXAMPLES_TEMPLATE,
} from './prompts';

export type ExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

export interface ExtractionOptions {
  includeExamples?: boolean; // Pro feature: include example sentences
}

// Extracts words from an image using OpenAI's vision API
// Returns validated word data or an error message
export async function extractWordsFromImage(
  imageBase64: string,
  apiKey: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const openai = new OpenAI({ apiKey });
  const { includeExamples = false } = options;

  // Select prompts based on whether examples are requested (Pro feature)
  const systemPrompt = includeExamples
    ? WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT
    : WORD_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = includeExamples
    ? USER_PROMPT_WITH_EXAMPLES_TEMPLATE
    : USER_PROMPT_TEMPLATE;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:')
                  ? imageBase64
                  : `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return { success: false, error: '画像を読み取れませんでした' };
    }

    // Parse JSON response
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { success: false, error: 'AIの応答を解析できませんでした' };
    }

    // Validate with Zod schema
    const validated = parseAIResponse(parsed);

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
    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return { success: false, error: 'APIキーが無効です' };
      }
      if (error.status === 429) {
        return { success: false, error: 'API制限に達しました。しばらく待ってから再試行してください。' };
      }
      return { success: false, error: `API Error: ${error.message}` };
    }

    return {
      success: false,
      error: '予期しないエラーが発生しました。もう一度お試しください。',
    };
  }
}
