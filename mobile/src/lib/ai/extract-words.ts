import type { AIWordExtraction } from '../../types';
import { supabase } from '../supabase';
import { WEB_APP_BASE_URL, withWebAppBase } from '../web-base-url';

export type ExtractMode = 'all' | 'circled' | 'eiken';
export type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

export interface ExtractWordsResult {
  success: boolean;
  words?: AIWordExtraction[];
  error?: string;
}

export interface ExtractWordsOptions {
  mode?: ExtractMode;
  eikenLevel?: EikenLevel;
  isPro?: boolean;
}

export async function extractWordsFromImage(
  base64Image: string,
  options?: ExtractWordsOptions
): Promise<ExtractWordsResult> {
  if (!WEB_APP_BASE_URL) {
    return {
      success: false,
      error: 'EXPO_PUBLIC_APP_URL が未設定のため、スキャン API を利用できません。',
    };
  }

  const { mode = 'all', eikenLevel = null } = options || {};

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return {
        success: false,
        error: 'ログインが必要です。ログイン後に再試行してください。',
      };
    }

    const response = await fetch(withWebAppBase('/api/extract'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        image: base64Image,
        mode,
        eikenLevel,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      return {
        success: false,
        error: message || '単語抽出に失敗しました。',
      };
    }

    const data = await response.json();

    return {
      success: true,
      words: Array.isArray(data.words) ? (data.words as AIWordExtraction[]) : [],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '単語抽出に失敗しました。',
    };
  }
}
