import { parseGrammarResponse, type ValidatedGrammarResponse } from '@/lib/schemas/grammar-response';
import {
  GRAMMAR_OCR_PROMPT,
  GRAMMAR_ANALYSIS_SYSTEM_PROMPT,
  GRAMMAR_ANALYSIS_USER_PROMPT,
} from './prompts';
import { AI_CONFIG } from './config';
import { getProviderFromConfig, AIError } from './providers';
import { prepareImageForProvider } from './utils/image';
import { safeParseJSON } from './utils/json';

export type GrammarExtractionResult =
  | { success: true; data: ValidatedGrammarResponse }
  | { success: false; error: string };

/**
 * Two-stage grammar extraction:
 * 1. OCR: Extract text from image using Gemini
 * 2. Analysis: Identify grammar patterns + generate quiz questions
 */
export async function extractGrammarFromImage(
  imageBase64: string,
  apiKeys: { gemini?: string; openai?: string },
): Promise<GrammarExtractionResult> {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return { success: false, error: '画像データが無効です' };
  }

  if (imageBase64.startsWith('data:') && !imageBase64.includes(',')) {
    return { success: false, error: '画像データの形式が不正です' };
  }

  // ============================================
  // Stage 1: OCR — Extract text from image
  // ============================================
  const ocrConfig = AI_CONFIG.extraction.grammar.ocr;
  const ocrProvider = getProviderFromConfig(ocrConfig, apiKeys);
  const image = prepareImageForProvider(imageBase64);

  let extractedText: string;

  try {
    const ocrResponse = await ocrProvider.generate({
      systemPrompt: 'あなたはOCR専門のアシスタントです。画像からテキストを正確に抽出します。',
      prompt: GRAMMAR_OCR_PROMPT,
      image,
      config: {
        ...ocrConfig,
        responseFormat: 'text',
      },
    });

    if (!ocrResponse.success || !ocrResponse.content) {
      return { success: false, error: '画像からテキストを読み取れませんでした' };
    }

    extractedText = ocrResponse.content;
    console.log('Grammar OCR extracted text length:', extractedText.length);
  } catch (error) {
    console.error('Grammar OCR error:', error);
    if (error instanceof AIError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: '画像の読み取りに失敗しました。もう一度お試しください。' };
  }

  // ============================================
  // Stage 2: Analysis — Identify patterns + generate quiz
  // ============================================
  const analysisConfig = AI_CONFIG.extraction.grammar.analysis;
  const analysisProvider = getProviderFromConfig(analysisConfig, apiKeys);

  try {
    const analysisResponse = await analysisProvider.generate({
      systemPrompt: GRAMMAR_ANALYSIS_SYSTEM_PROMPT,
      prompt: GRAMMAR_ANALYSIS_USER_PROMPT + extractedText,
      config: {
        ...analysisConfig,
        responseFormat: 'json',
      },
    });

    if (!analysisResponse.success || !analysisResponse.content) {
      return { success: false, error: '文法パターンの分析に失敗しました' };
    }

    const parseResult = safeParseJSON(analysisResponse.content);
    if (!parseResult.success) {
      console.error('Grammar JSON parse error:', parseResult.error);
      console.error('Raw content (first 500 chars):', analysisResponse.content.slice(0, 500));
      return { success: false, error: '文法データの解析に失敗しました' };
    }

    const validated = parseGrammarResponse(parseResult.data);

    if (!validated.success) {
      return { success: false, error: validated.error || '文法データ形式が不正です' };
    }

    if (validated.data!.grammarPatterns.length === 0) {
      return {
        success: false,
        error: '高度な文法パターンが見つかりませんでした。準1級〜1級レベルの文法を含む画像をお試しください。',
      };
    }

    return { success: true, data: validated.data! };
  } catch (error) {
    console.error('Grammar analysis error:', error);
    if (error instanceof AIError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: '文法の分析に失敗しました。もう一度お試しください。' };
  }
}
