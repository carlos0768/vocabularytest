import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT,
  CIRCLED_WORD_USER_PROMPT,
  CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT,
  getEikenFilterInstruction,
} from './prompts';
import { AI_CONFIG } from './config';
import { getProviderFromConfig } from './providers';

export type CircledExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

interface CircledExtractionDependencies {
  getProviderFromConfig: typeof getProviderFromConfig;
}

export interface CircledExtractionOptions {
  eikenLevel?: string | null;
  dependencies?: Partial<CircledExtractionDependencies>;
}

const CIRCLED_VERIFICATION_THRESHOLD = 10;

function extractJsonContent(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  const jsonStartIndex = content.indexOf('{');
  const jsonEndIndex = content.lastIndexOf('}');
  if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
    return content.slice(jsonStartIndex, jsonEndIndex + 1);
  }

  return content;
}

function parseValidatedResponse(content: string): CircledExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonContent(content));
  } catch {
    console.error('Failed to parse Gemini response:', content);
    return { success: false, error: 'AIの応答を解析できませんでした' };
  }

  const validated = parseAIResponse(parsed);
  if (!validated.success || !validated.data) {
    return {
      success: false,
      error: validated.error || 'データ形式が不正です',
    };
  }

  return { success: true, data: dedupeWords(validated.data) };
}

function normalizeEnglish(word: string): string {
  return word.trim().toLowerCase();
}

function dedupeWords(data: ValidatedAIResponse): ValidatedAIResponse {
  const seen = new Set<string>();
  const uniqueWords: ValidatedAIResponse['words'] = [];

  for (const word of data.words) {
    const key = `${normalizeEnglish(word.english)}::${word.japanese.trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueWords.push(word);
    }
  }

  return {
    words: uniqueWords,
    sourceLabels: data.sourceLabels,
  };
}

function buildVerificationPrompt(words: ValidatedAIResponse['words']): string {
  const candidateList = words
    .map((word, index) => `${index + 1}. english=${JSON.stringify(word.english)}, japanese=${JSON.stringify(word.japanese)}`)
    .join('\n');

  return `一次抽出の候補リストです。画像を再確認し、手書きの丸（○/楕円）で囲まれている候補だけを残してください。

候補:
${candidateList}

判定ルール:
- 丸が明確に確認できない候補は除外する
- 印刷済みの記号・枠・注釈は除外する
- 候補リストにない語は追加しない

出力は次のJSONのみ:
{
  "words": [
    {
      "english": "word",
      "japanese": "意味"
    }
  ]
}`;
}

// Extracts only hand-circled words from an image using AI provider (Cloud Run or direct)
export async function extractCircledWordsFromImage(
  imageBase64: string,
  apiKeys: { gemini?: string; openai?: string },
  options: CircledExtractionOptions = {}
): Promise<CircledExtractionResult> {
  const { eikenLevel = null, dependencies = {} } = options;

  // Validate input
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.error('Invalid imageBase64:', typeof imageBase64, imageBase64?.length);
    return { success: false, error: '画像データが無効です' };
  }

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

  console.log('AI API call (circled mode):', { mimeType, base64Length: base64Data.length });

  try {
    const config = AI_CONFIG.extraction.circled;
    const resolveProvider = dependencies.getProviderFromConfig ?? getProviderFromConfig;
    const provider = resolveProvider(config, apiKeys);

    const result = await provider.generate({
      systemPrompt: `${CIRCLED_WORD_EXTRACTION_SYSTEM_PROMPT}${getEikenFilterInstruction(eikenLevel)}`,
      prompt: CIRCLED_WORD_USER_PROMPT,
      image: { base64: base64Data, mimeType },
      config: {
        ...config,
        responseFormat: 'json',
      },
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const content = result.content;

    if (!content) {
      return { success: false, error: '画像を読み取れませんでした' };
    }

    const parsedPrimary = parseValidatedResponse(content);
    if (!parsedPrimary.success) {
      return parsedPrimary;
    }

    let circledWords = parsedPrimary.data.words;

    if (circledWords.length > CIRCLED_VERIFICATION_THRESHOLD) {
      console.warn('High-volume circled extraction detected. Running verification pass.', {
        candidateCount: circledWords.length,
      });

      const verification = await provider.generate({
        systemPrompt: CIRCLED_WORD_VERIFICATION_SYSTEM_PROMPT,
        prompt: buildVerificationPrompt(circledWords),
        image: { base64: base64Data, mimeType },
        config: {
          ...config,
          temperature: 0,
          maxOutputTokens: Math.min(config.maxOutputTokens, 8192),
          responseFormat: 'json',
        },
      });

      if (!verification.success) {
        console.warn('Circled verification pass failed. Falling back to primary extraction.', {
          error: verification.error,
        });
      } else if (verification.content) {
        const parsedVerification = parseValidatedResponse(verification.content);
        if (!parsedVerification.success) {
          console.warn('Failed to parse circled verification response. Falling back to primary extraction.', {
            error: parsedVerification.error,
          });
        } else {
          const candidateMap = new Map<string, ValidatedAIResponse['words'][number]>();
          for (const word of circledWords) {
            const key = normalizeEnglish(word.english);
            if (!candidateMap.has(key)) {
              candidateMap.set(key, word);
            }
          }

          const confirmedWords: ValidatedAIResponse['words'] = [];
          const seenConfirmed = new Set<string>();
          for (const word of parsedVerification.data.words) {
            const key = normalizeEnglish(word.english);
            if (!key || seenConfirmed.has(key)) continue;
            const matched = candidateMap.get(key);
            if (matched) {
              seenConfirmed.add(key);
              confirmedWords.push(matched);
            }
          }

          console.log('Circled verification reduced candidates:', {
            before: circledWords.length,
            after: confirmedWords.length,
          });

          circledWords = confirmedWords;
        }
      }
    }

    if (circledWords.length === 0) {
      return {
        success: false,
        error: '手書きの丸で囲まれた単語が見つかりませんでした。丸をつけた単語がある画像を撮影してください。',
      };
    }

    return {
      success: true,
      data: {
        words: circledWords,
        sourceLabels: parsedPrimary.data.sourceLabels,
      },
    };
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
