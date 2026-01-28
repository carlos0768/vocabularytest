import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  EIKEN_OCR_PROMPT,
  EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT,
  EIKEN_WORD_ANALYSIS_USER_PROMPT,
  EIKEN_LEVEL_DESCRIPTIONS,
  getEikenLevelsAbove,
} from './prompts';
import type { EikenLevel } from '@/app/api/extract/route';

// Result type for OCR extraction
export type EikenOCRResult =
  | { success: true; text: string }
  | { success: false; error: string };

// Result type for word analysis
export type EikenWordAnalysisResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

// Combined result for the full pipeline
export type EikenExtractionResult =
  | { success: true; extractedText: string; data: ValidatedAIResponse }
  | { success: false; error: string };

/**
 * Step 1: Extract text from image using Gemini OCR
 */
export async function extractTextForEiken(
  imageBase64: string,
  geminiApiKey: string
): Promise<EikenOCRResult> {
  // Validate input
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.error('Invalid imageBase64:', typeof imageBase64, imageBase64?.length);
    return { success: false, error: '画像データが無効です' };
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

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

  console.log('Gemini OCR for EIKEN:', { mimeType, base64Length: base64Data.length });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: EIKEN_OCR_PROMPT,
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
        temperature: 0.3, // Lower temperature for accurate OCR
        maxOutputTokens: 4096,
      },
    });

    const text = response.text?.trim();

    if (!text) {
      return { success: false, error: '画像からテキストを読み取れませんでした' };
    }

    return { success: true, text };
  } catch (error) {
    console.error('Gemini OCR error:', error);

    if (error instanceof Error) {
      const errorMessage = error.message;
      console.error('Gemini error message:', errorMessage);

      if (errorMessage.includes('API key') || errorMessage.includes('API_KEY')) {
        return { success: false, error: 'Gemini APIキーが無効です' };
      }
      if (errorMessage.includes('quota') || errorMessage.includes('rate')) {
        return { success: false, error: 'API制限に達しました。しばらく待ってから再試行してください。' };
      }
    }

    return {
      success: false,
      error: '画像の読み取りに失敗しました。もう一度お試しください。',
    };
  }
}

/**
 * Step 2: Analyze text and extract words at specified EIKEN level using GPT-4o
 */
export async function analyzeWordsForEiken(
  text: string,
  openaiApiKey: string,
  eikenLevel: EikenLevel
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

  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Build prompts with level filter
  const levelsAbove = getEikenLevelsAbove(eikenLevel);
  const levelRange = levelsAbove.map(level => EIKEN_LEVEL_DESCRIPTIONS[level]).join('、');
  const systemPrompt = EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT
    .replace('{LEVEL_DESC}', levelDesc)
    .replace('{LEVEL_RANGE}', levelRange);
  const userPrompt = EIKEN_WORD_ANALYSIS_USER_PROMPT + text;

  console.log('GPT Word analysis for EIKEN:', { textLength: text.length, eikenLevel });

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
          content: userPrompt,
        },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return { success: false, error: '単語解析の結果を取得できませんでした' };
    }

    // Parse JSON response
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('Failed to parse GPT response:', content);
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
        error: `${levelDesc}に該当する単語が見つかりませんでした。別の画像をお試しください。`,
      };
    }

    return { success: true, data: validated.data! };
  } catch (error) {
    console.error('OpenAI word analysis error:', error);

    if (error instanceof OpenAI.APIError) {
      console.error('OpenAI API Error:', { status: error.status, message: error.message });
      if (error.status === 401) {
        return { success: false, error: 'APIキーが無効です' };
      }
      if (error.status === 429) {
        return { success: false, error: 'API制限に達しました。しばらく待ってから再試行してください。' };
      }
    }

    return {
      success: false,
      error: '単語解析に失敗しました。もう一度お試しください。',
    };
  }
}

/**
 * Full pipeline: Extract text with Gemini → Analyze words with GPT at specified EIKEN level
 */
export async function extractEikenWordsFromImage(
  imageBase64: string,
  geminiApiKey: string,
  openaiApiKey: string,
  eikenLevel: EikenLevel
): Promise<EikenExtractionResult> {
  // Step 1: OCR with Gemini
  const ocrResult = await extractTextForEiken(imageBase64, geminiApiKey);

  if (!ocrResult.success) {
    return ocrResult;
  }

  // Step 2: Word analysis with GPT
  const analysisResult = await analyzeWordsForEiken(
    ocrResult.text,
    openaiApiKey,
    eikenLevel
  );

  if (!analysisResult.success) {
    return analysisResult;
  }

  return {
    success: true,
    extractedText: ocrResult.text,
    data: analysisResult.data,
  };
}
