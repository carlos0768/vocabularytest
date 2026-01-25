import { GoogleGenAI } from '@google/genai';
import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT,
  CIRCLED_WORD_USER_PROMPT,
} from './prompts';

export type CircledExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

// Extracts only circled/marked words from an image using Google Gemini API
// Uses gemini-2.0-flash-thinking-exp model for enhanced reasoning
export async function extractCircledWordsFromImage(
  imageBase64: string,
  apiKey: string
): Promise<CircledExtractionResult> {
  const ai = new GoogleGenAI({ apiKey });

  // Remove data URL prefix if present
  const base64Data = imageBase64.startsWith('data:')
    ? imageBase64.split(',')[1]
    : imageBase64;

  // Determine MIME type from data URL or default to jpeg
  let mimeType = 'image/jpeg';
  if (imageBase64.startsWith('data:')) {
    const match = imageBase64.match(/^data:([^;]+);/);
    if (match) {
      mimeType = match[1];
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-thinking-exp',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT}\n\n${CIRCLED_WORD_USER_PROMPT}`,
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
      if (error.message.includes('API key')) {
        return { success: false, error: 'Gemini APIキーが無効です' };
      }
      if (error.message.includes('quota') || error.message.includes('rate')) {
        return { success: false, error: 'API制限に達しました。しばらく待ってから再試行してください。' };
      }
    }

    return {
      success: false,
      error: '予期しないエラーが発生しました。もう一度お試しください。',
    };
  }
}
