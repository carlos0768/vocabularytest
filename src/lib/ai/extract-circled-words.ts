import { GoogleGenAI } from '@google/genai';
import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT,
  CIRCLED_WORD_USER_PROMPT,
  getEikenFilterInstruction,
} from './prompts';

export type CircledExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

export interface CircledExtractionOptions {
  eikenLevel?: string | null;
}

// Extracts only circled/marked words from an image using Google Gemini API
// Uses gemini-2.0-flash model for image analysis
export async function extractCircledWordsFromImage(
  imageBase64: string,
  apiKey: string,
  options: CircledExtractionOptions = {}
): Promise<CircledExtractionResult> {
  const { eikenLevel = null } = options;

  // Validate input
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.error('Invalid imageBase64:', typeof imageBase64, imageBase64?.length);
    return { success: false, error: '画像データが無効です' };
  }

  const ai = new GoogleGenAI({ apiKey });

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

  console.log('Gemini API call:', { mimeType, base64Length: base64Data.length });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT}${getEikenFilterInstruction(eikenLevel)}\n\n${CIRCLED_WORD_USER_PROMPT}`,
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    const content = response.text;

    if (!content) {
      return { success: false, error: '画像を読み取れませんでした' };
    }

    // Extract JSON from response (Gemini may include markdown code blocks)
    let jsonContent = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    } else {
      // Try to find JSON object directly
      const jsonStartIndex = content.indexOf('{');
      const jsonEndIndex = content.lastIndexOf('}');
      if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        jsonContent = content.slice(jsonStartIndex, jsonEndIndex + 1);
      }
    }

    // Parse JSON response
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      console.error('Failed to parse Gemini response:', content);
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
        error: '丸やマークがついた単語が見つかりませんでした。マークをつけた単語がある画像を撮影してください。',
      };
    }

    return { success: true, data: validated.data! };
  } catch (error) {
    console.error('Gemini API error:', error);

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
