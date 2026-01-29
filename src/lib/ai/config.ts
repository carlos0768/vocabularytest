/**
 * AI Configuration
 *
 * 全てのAI設定を一元管理するファイル。
 * モデルを変更する場合はここを変更するだけでOK。
 */

export type AIProvider = 'gemini' | 'openai';
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.0-flash' | 'gemini-2.0-flash' | 'gemini-1.5-pro' | 'gemini-1.5-flash';
export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  responseFormat?: 'json' | 'text';
}

export interface AIConfig {
  // 抽出タスク別の設定
  extraction: {
    words: AIModelConfig;
    idioms: AIModelConfig;
    eiken: AIModelConfig;
    circled: AIModelConfig;
    grammar: {
      ocr: AIModelConfig;
      analysis: AIModelConfig;
    };
  };
  // デフォルト設定
  defaults: {
    gemini: AIModelConfig;
    openai: AIModelConfig;
  };
}

/**
 * デフォルトのAI設定
 *
 * モデルを変更したい場合は、該当するタスクの設定を変更するだけ。
 * 例: 単語抽出をGPT-4oに変更したい場合
 *     AI_CONFIG.extraction.words.provider = 'openai'
 *     AI_CONFIG.extraction.words.model = 'gpt-4o'
 */
export const AI_CONFIG: AIConfig = {
  extraction: {
    // 単語抽出（all mode）
    words: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxOutputTokens: 65536,
    },
    // 熟語抽出（idiom mode）
    idioms: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxOutputTokens: 65536,
    },
    // 英検レベル別抽出（eiken mode）
    eiken: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxOutputTokens: 65536,
    },
    // 丸印単語抽出（circled mode）
    circled: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxOutputTokens: 65536,
    },
    // 文法抽出（2段階処理）
    grammar: {
      ocr: {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
      analysis: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.7,
        maxOutputTokens: 16384,
      },
    },
  },
  // デフォルト設定（新しいタスク追加時に使用）
  defaults: {
    gemini: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxOutputTokens: 65536,
    },
    openai: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
  },
};

/**
 * 環境変数からAPIキーを取得
 */
export function getAPIKeys() {
  return {
    gemini: process.env.GOOGLE_AI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
}

/**
 * 指定されたプロバイダーのAPIキーを取得
 */
export function getAPIKey(provider: AIProvider): string | undefined {
  const keys = getAPIKeys();
  return keys[provider];
}

/**
 * 全モードを一括でプロバイダー変更（テスト用）
 */
export function setGlobalProvider(provider: AIProvider, model?: string): void {
  const defaultModel = provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o';
  const targetModel = model || defaultModel;

  AI_CONFIG.extraction.words.provider = provider;
  AI_CONFIG.extraction.words.model = targetModel;

  AI_CONFIG.extraction.idioms.provider = provider;
  AI_CONFIG.extraction.idioms.model = targetModel;

  AI_CONFIG.extraction.eiken.provider = provider;
  AI_CONFIG.extraction.eiken.model = targetModel;

  AI_CONFIG.extraction.circled.provider = provider;
  AI_CONFIG.extraction.circled.model = targetModel;
}
