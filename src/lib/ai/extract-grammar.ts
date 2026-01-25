import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import {
  GRAMMAR_OCR_PROMPT,
  GRAMMAR_ANALYSIS_SYSTEM_PROMPT,
  GRAMMAR_ANALYSIS_USER_PROMPT,
  getGrammarLevelFilterInstruction,
} from './prompts';
import type { AIGrammarExtraction, EikenGrammarLevel } from '@/types';

// Result type for OCR extraction
export type OCRResult =
  | { success: true; text: string }
  | { success: false; error: string };

// Result type for grammar analysis
export type GrammarAnalysisResult =
  | { success: true; patterns: AIGrammarExtraction[] }
  | { success: false; error: string };

// Combined result for the full pipeline
export type GrammarExtractionResult =
  | { success: true; extractedText: string; patterns: AIGrammarExtraction[] }
  | { success: false; error: string };

/**
 * Step 1: Extract text from image using Gemini OCR
 */
export async function extractTextFromImage(
  imageBase64: string,
  geminiApiKey: string
): Promise<OCRResult> {
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

  console.log('Gemini OCR call:', { mimeType, base64Length: base64Data.length });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: GRAMMAR_OCR_PROMPT,
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
 * Step 2: Analyze text for grammar patterns using GPT-4o
 */
export async function analyzeGrammarPatterns(
  text: string,
  openaiApiKey: string,
  eikenLevel: EikenGrammarLevel = null
): Promise<GrammarAnalysisResult> {
  if (!text || text.trim().length === 0) {
    return { success: false, error: '解析するテキストがありません' };
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Build system prompt with level filter
  const levelFilter = getGrammarLevelFilterInstruction(eikenLevel);
  const systemPrompt = GRAMMAR_ANALYSIS_SYSTEM_PROMPT + levelFilter;
  const userPrompt = GRAMMAR_ANALYSIS_USER_PROMPT + text;

  console.log('GPT Grammar analysis:', { textLength: text.length, eikenLevel });

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
      max_tokens: 16384,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return { success: false, error: '文法解析の結果を取得できませんでした' };
    }

    // Parse JSON response
    let parsed: { grammarPatterns?: AIGrammarExtraction[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('Failed to parse GPT response:', content);
      return { success: false, error: 'AIの応答を解析できませんでした' };
    }

    const patterns = parsed.grammarPatterns || [];

    if (patterns.length === 0) {
      return {
        success: false,
        error: '文法パターンが見つかりませんでした。別の英文を含む画像をお試しください。',
      };
    }

    return { success: true, patterns };
  } catch (error) {
    console.error('OpenAI grammar analysis error:', error);

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
      error: '文法解析に失敗しました。もう一度お試しください。',
    };
  }
}

/**
 * Full pipeline: Extract text → Analyze grammar
 */
export async function extractGrammarFromImage(
  imageBase64: string,
  geminiApiKey: string,
  openaiApiKey: string,
  eikenLevel: EikenGrammarLevel = null
): Promise<GrammarExtractionResult> {
  // Step 1: OCR with Gemini
  const ocrResult = await extractTextFromImage(imageBase64, geminiApiKey);

  if (!ocrResult.success) {
    return ocrResult;
  }

  // Step 2: Grammar analysis with GPT
  const analysisResult = await analyzeGrammarPatterns(
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
    patterns: analysisResult.patterns,
  };
}
