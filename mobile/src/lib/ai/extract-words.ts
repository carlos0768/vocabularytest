import type { AIWordExtraction } from '../../types';

// Use the web app's API endpoint
// For development, use local server (port 3000). For production, use Vercel.
const API_URL = __DEV__
  ? 'http://192.168.0.86:3000/api/extract'
  : 'https://scanvocab.vercel.app/api/extract';

// Log which URL we're using
console.log('Using API URL:', API_URL);

export interface ExtractWordsResult {
  success: boolean;
  words?: AIWordExtraction[];
  error?: string;
}

export async function extractWordsFromImage(
  base64Image: string
): Promise<ExtractWordsResult> {
  try {
    console.log('Starting API request to:', API_URL);
    console.log('Image size:', Math.round(base64Image.length / 1024), 'KB');

    // Add timeout of 90 seconds (AI processing can take time)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', response.status, errorText);

      let error: { error?: string } = {};
      try {
        error = JSON.parse(errorText);
      } catch {
        // Not JSON
      }

      if (response.status === 429) {
        return {
          success: false,
          error: 'API利用制限に達しました。しばらく待ってから再試行してください。',
        };
      }

      return {
        success: false,
        error: error.error || `APIエラー (${response.status}): ${errorText.substring(0, 100)}`,
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

    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message === 'Aborted') {
        return {
          success: false,
          error: 'リクエストがタイムアウトしました。ネットワーク接続を確認して再試行してください。',
        };
      }

      if (error.message.includes('Network request failed') || error.message.includes('fetch')) {
        return {
          success: false,
          error: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: '予期しないエラーが発生しました',
    };
  }
}
