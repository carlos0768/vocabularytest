import type { AIWordExtraction } from '../../types';

// Use the web app's API endpoint
const API_URL = 'https://scanvocab.vercel.app/api/extract';

export interface ExtractWordsResult {
  success: boolean;
  words?: AIWordExtraction[];
  error?: string;
}

export async function extractWordsFromImage(
  base64Image: string
): Promise<ExtractWordsResult> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));

      if (response.status === 429) {
        return {
          success: false,
          error: 'API利用制限に達しました。しばらく待ってから再試行してください。',
        };
      }

      return {
        success: false,
        error: error.error || 'APIエラーが発生しました',
      };
    }

    const data = await response.json();

    // The API returns { words: [...] } on success
    if (!data.words || !Array.isArray(data.words)) {
      return {
        success: false,
        error: '単語を抽出できませんでした。別の画像をお試しください。',
      };
    }

    // Validate each word
    const validWords = data.words.filter(
      (word: AIWordExtraction) =>
        word.english &&
        word.japanese &&
        Array.isArray(word.distractors) &&
        word.distractors.length === 3
    );

    if (validWords.length === 0) {
      return {
        success: false,
        error: '有効な単語が見つかりませんでした。別の画像をお試しください。',
      };
    }

    return {
      success: true,
      words: validWords,
    };
  } catch (error) {
    console.error('Extract words error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました',
    };
  }
}
