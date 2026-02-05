/**
 * AI Configuration
 *
 * 全てのAI設定を一允E��琁E��るファイル、E * モチE��を変更する場合�Eここを変更するだけでOK、E */

export type AIProvider = 'gemini' | 'openai';
export type GeminiModel = 'gemini-1.5-flash-002' | 'gemini-1.5-pro-002' | 'gemini-2.0-flash-001';
export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  responseFormat?: 'json' | 'text';
}

export interface AIConfig {
  // 抽出タスク別の設宁E  extraction: {
    words: AIModelConfig;
    idioms: AIModelConfig;
    eiken: AIModelConfig;
    circled: AIModelConfig;
    grammar: {
      ocr: AIModelConfig;
      analysis: AIModelConfig;
    };
  };
  // チE��ォルト設宁E  defaults: {
    gemini: AIModelConfig;
    openai: AIModelConfig;
  };
}

/**
 * チE��ォルト�EAI設宁E *
 * モチE��を変更したぁE��合�E、該当するタスクの設定を変更するだけ、E * 侁E 単語抽出をGPT-4oに変更したぁE��吁E *     AI_CONFIG.extraction.words.provider = 'openai'
 *     AI_CONFIG.extraction.words.model = 'gpt-4o'
 */
export const AI_CONFIG: AIConfig = {
  extraction: {
    // 単語抽出�E�Ell mode�E�E    words: {
      provider: 'gemini',
      model: 'gemini-1.5-flash-002',
      temperature: 0.7,
      maxOutputTokens: 65535,
    },
    // 熟語抽出�E�Ediom mode�E�E    idioms: {
      provider: 'gemini',
      model: 'gemini-1.5-flash-002',
      temperature: 0.7,
      maxOutputTokens: 65535,
    },
    // 英検レベル別抽出�E�Eiken mode�E�E    eiken: {
      provider: 'gemini',
      model: 'gemini-1.5-flash-002',
      temperature: 0.7,
      maxOutputTokens: 65535,
    },
    // 丸印単語抽出�E�Eircled mode�E�E    circled: {
      provider: 'gemini',
      model: 'gemini-1.5-flash-002',
      temperature: 0.7,
      maxOutputTokens: 65535,
    },
    // 斁E��抽出�E�E段階�E琁E��E    grammar: {
      ocr: {
        provider: 'gemini',
        model: 'gemini-1.5-flash-002',
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
  // チE��ォルト設定（新しいタスク追加時に使用�E�E  defaults: {
    gemini: {
      provider: 'gemini',
      model: 'gemini-1.5-flash-002',
      temperature: 0.7,
      maxOutputTokens: 65535,
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
 * 環墁E��数からAPIキーを取征E */
export function getAPIKeys() {
  return {
    gemini: process.env.GOOGLE_AI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
}

/**
 * 持E��されたプロバイダーのAPIキーを取征E */
export function getAPIKey(provider: AIProvider): string | undefined {
  const keys = getAPIKeys();
  return keys[provider];
}

/**
 * 全モードを一括でプロバイダー変更�E�テスト用�E�E */
export function setGlobalProvider(provider: AIProvider, model?: string): void {
  const defaultModel = provider === 'gemini' ? 'gemini-1.5-flash-002' : 'gpt-4o';
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
