import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  WRONG_ANSWER_OCR_SYSTEM_PROMPT,
  WRONG_ANSWER_OCR_USER_PROMPT,
  WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT,
  WRONG_ANSWER_ANALYSIS_USER_PROMPT,
} from './prompts';

// Type for OCR result - structured test data
export interface TestQuestion {
  questionNumber: number;
  question: string;
  studentAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean | null;
  markingSymbol: '○' | '×' | '△' | 'none' | 'unclear';
  confidence: number;
}

export interface TestOCRData {
  testType: 'english_to_japanese' | 'japanese_to_english' | 'multiple_choice' | 'mixed';
  questions: TestQuestion[];
  totalQuestions: number;
  detectedCorrectCount: number;
  detectedWrongCount: number;
  notes: string;
}

// Result type for OCR extraction
export type WrongAnswerOCRResult =
  | { success: true; data: TestOCRData }
  | { success: false; error: string };

// Result type for word analysis
export type WrongAnswerAnalysisResult =
  | { success: true; data: ValidatedAIResponse; summary: WrongAnswerSummary }
  | { success: false; error: string };

// Summary information
export interface WrongAnswerSummary {
  totalWrong: number;
  testType: string;
  suggestions?: string;
}

// Combined result for the full pipeline
export type WrongAnswerExtractionResult =
  | { success: true; ocrData: TestOCRData; data: ValidatedAIResponse; summary: WrongAnswerSummary }
  | { success: false; error: string };

/**
 * Step 1: Extract test structure from image using Gemini
 * Analyzes the vocabulary test image and extracts question/answer/marking data
 */
export async function extractTestFromImage(
  imageBase64: string,
  geminiApiKey: string
): Promise<WrongAnswerOCRResult> {
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

  console.log('Gemini OCR for Wrong Answer extraction:', { mimeType, base64Length: base64Data.length });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${WRONG_ANSWER_OCR_SYSTEM_PROMPT}\n\n${WRONG_ANSWER_OCR_USER_PROMPT}`,
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
        maxOutputTokens: 8192, // Larger output for detailed test data
      },
    });

    const content = response.text?.trim();

    if (!content) {
      return { success: false, error: '画像からテストを読み取れませんでした' };
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
    let parsed: TestOCRData;
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      console.error('Failed to parse Gemini response:', content);
      return { success: false, error: 'テストの解析に失敗しました。画像が不鮮明な可能性があります。' };
    }

    // Basic validation
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      console.error('Invalid test data structure:', parsed);
      return { success: false, error: 'テストの構造を認識できませんでした' };
    }

    if (parsed.questions.length === 0) {
      return { success: false, error: 'テストの問題が見つかりませんでした。単語テストの画像を撮影してください。' };
    }

    return { success: true, data: parsed };
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
      error: 'テスト画像の読み取りに失敗しました。もう一度お試しください。',
    };
  }
}

/**
 * Step 2: Analyze test data and extract only wrong answers using GPT-4o
 * Generates vocabulary data for incorrectly answered questions
 */
export async function analyzeWrongAnswers(
  testData: TestOCRData,
  openaiApiKey: string
): Promise<WrongAnswerAnalysisResult> {
  if (!testData.questions || testData.questions.length === 0) {
    return { success: false, error: '解析するテストデータがありません' };
  }

  // Check if there are any wrong answers
  const wrongAnswers = testData.questions.filter(
    q => q.isCorrect === false || q.markingSymbol === '×' || q.markingSymbol === '△'
  );

  if (wrongAnswers.length === 0) {
    // All correct - return empty result with success
    return {
      success: true,
      data: { words: [] },
      summary: {
        totalWrong: 0,
        testType: testData.testType,
        suggestions: '全問正解です！素晴らしい！',
      },
    };
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });

  const systemPrompt = WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT;
  const userPrompt = WRONG_ANSWER_ANALYSIS_USER_PROMPT + JSON.stringify(testData, null, 2);

  console.log('GPT Wrong Answer analysis:', {
    totalQuestions: testData.questions.length,
    wrongCount: wrongAnswers.length,
    testType: testData.testType,
  });

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
      return { success: false, error: '間違い分析の結果を取得できませんでした' };
    }

    // Parse JSON response
    let parsed: { words: unknown[]; summary?: WrongAnswerSummary };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('Failed to parse GPT response:', content);
      return { success: false, error: 'AIの応答を解析できませんでした' };
    }

    // Validate with Zod schema (for words array)
    const validated = parseAIResponse({ words: parsed.words });

    if (!validated.success) {
      return {
        success: false,
        error: validated.error || 'データ形式が不正です',
      };
    }

    // Extract summary
    const summary: WrongAnswerSummary = parsed.summary || {
      totalWrong: validated.data!.words.length,
      testType: testData.testType,
    };

    return {
      success: true,
      data: validated.data!,
      summary,
    };
  } catch (error) {
    console.error('OpenAI wrong answer analysis error:', error);

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
      error: '間違い分析に失敗しました。もう一度お試しください。',
    };
  }
}

/**
 * Full pipeline: Extract test with Gemini → Analyze wrong answers with GPT
 * Returns only the incorrectly answered words as vocabulary data
 */
export async function extractWrongAnswersFromImage(
  imageBase64: string,
  geminiApiKey: string,
  openaiApiKey: string
): Promise<WrongAnswerExtractionResult> {
  // Step 1: OCR with Gemini - extract test structure
  const ocrResult = await extractTestFromImage(imageBase64, geminiApiKey);

  if (!ocrResult.success) {
    return ocrResult;
  }

  // Step 2: Analyze wrong answers with GPT
  const analysisResult = await analyzeWrongAnswers(ocrResult.data, openaiApiKey);

  if (!analysisResult.success) {
    return analysisResult;
  }

  return {
    success: true,
    ocrData: ocrResult.data,
    data: analysisResult.data,
    summary: analysisResult.summary,
  };
}
