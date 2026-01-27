import { GoogleGenAI } from '@google/genai';
import { type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  parseHighlightedResponse,
  filterByConfidence,
  removeDuplicates,
  convertToStandardFormat,
  CONFIDENCE_THRESHOLD,
  type HighlightedResponse,
} from '@/lib/schemas/highlighted-response';
import {
  HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT,
  HIGHLIGHTED_WORD_USER_PROMPT,
} from './prompts';

export type HighlightedExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

// Extracts only highlighted/marker words from an image using Google Gemini API
// Uses gemini-2.5-flash-preview model for image analysis (optimized for visual feature detection)
// Features: color detection, confidence scoring, bounding box coordinates
export async function extractHighlightedWordsFromImage(
  imageBase64: string,
  apiKey: string
): Promise<HighlightedExtractionResult> {
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

  console.log('Gemini API call (highlighted mode):', {
    mimeType,
    base64Length: base64Data.length,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT}\n\n${HIGHLIGHTED_WORD_USER_PROMPT}`,
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
        temperature: 0.5, // Lower temperature for more consistent detection
        maxOutputTokens: 8192, // Increased for detailed bounding box data
      },
    });

    const content = response.text;

    if (!content) {
      return { success: false, error: '画像を読み取れませんでした' };
    }

    console.log('Gemini raw response (highlighted mode):', content.slice(0, 500) + '...');

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

    // Validate with enhanced highlighted response schema
    const validated = parseHighlightedResponse(parsed);

    if (!validated.success) {
      console.error('Schema validation failed:', validated.error);
      return {
        success: false,
        error: validated.error || 'データ形式が不正です',
      };
    }

    const highlightedData = validated.data as HighlightedResponse;

    // Log detection metadata
    console.log('Highlighted word detection metadata:', {
      totalWordsDetected: highlightedData.words.length,
      detectedColors: highlightedData.detectedColors,
      totalHighlightedRegions: highlightedData.totalHighlightedRegions,
    });

    // Apply confidence filtering
    const filteredWords = filterByConfidence(highlightedData.words, CONFIDENCE_THRESHOLD);

    console.log('Confidence filtering result:', {
      beforeFilter: highlightedData.words.length,
      afterFilter: filteredWords.length,
      threshold: CONFIDENCE_THRESHOLD,
      filteredOut: highlightedData.words.length - filteredWords.length,
    });

    // Remove duplicate words (keep highest confidence)
    const uniqueWords = removeDuplicates(filteredWords);

    console.log('Duplicate removal result:', {
      beforeDedup: filteredWords.length,
      afterDedup: uniqueWords.length,
      duplicatesRemoved: filteredWords.length - uniqueWords.length,
    });

    // Log individual word confidence scores for debugging
    uniqueWords.forEach((word, index) => {
      console.log(`Word ${index + 1}: "${word.english}" - confidence: ${word.confidence}, color: ${word.markerColor}`);
    });

    // Check if any words were extracted after filtering
    if (uniqueWords.length === 0) {
      // Check if there were words before filtering
      if (highlightedData.words.length > 0) {
        return {
          success: false,
          error: `検出された単語（${highlightedData.words.length}語）の確信度が低すぎました（閾値: ${CONFIDENCE_THRESHOLD * 100}%）。より鮮明なマーカーで再度お試しください。`,
        };
      }
      return {
        success: false,
        error: 'マーカーでハイライトされた単語が見つかりませんでした。蛍光ペンで線を引いた単語がある画像を撮影してください。',
      };
    }

    // Convert to standard format for compatibility with existing app infrastructure
    const standardFormat = convertToStandardFormat({
      ...highlightedData,
      words: uniqueWords,
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
