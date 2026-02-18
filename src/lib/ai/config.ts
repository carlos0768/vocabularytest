/**
 * AI Configuration
 *
 * 全てのAI設定を一元管理するファイル。
 * モデルを変更する場合はここを変更するだけでOK。
 */

export type AIProvider = 'gemini' | 'openai';
export type GeminiModel = 'gemini-1.5-flash-002' | 'gemini-1.5-pro-002' | 'gemini-2.0-flash-001';
export type OpenAIModel = 'gpt-5-mini' | (string & {});

const DEFAULT_OPENAI_MODEL: OpenAIModel = 'gpt-5-mini';

function resolveOpenAIModel(): string {
  const modelFromEnv = process.env.OPENAI_MODEL?.trim();
  if (modelFromEnv && modelFromEnv.length > 0) {
    return modelFromEnv;
  }
  return DEFAULT_OPENAI_MODEL;
}

const OPENAI_MODEL = resolveOpenAIModel();

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  responseFormat?: 'json' | 'text';
}

export interface AIConfig {
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
  defaults: {
    gemini: AIModelConfig;
    openai: AIModelConfig;
  };
}

export const AI_CONFIG: AIConfig = {
  extraction: {
    words: {
      provider: 'openai',
      model: OPENAI_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
    idioms: {
      provider: 'openai',
      model: OPENAI_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
    eiken: {
      provider: 'openai',
      model: OPENAI_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
    circled: {
      provider: 'openai',
      model: OPENAI_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
    grammar: {
      ocr: {
        provider: 'openai',
        model: OPENAI_MODEL,
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
      analysis: {
        provider: 'openai',
        model: OPENAI_MODEL,
        temperature: 0.7,
        maxOutputTokens: 16384,
      },
    },
  },
  defaults: {
    gemini: {
      provider: 'openai',
      model: OPENAI_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
    openai: {
      provider: 'openai',
      model: OPENAI_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
  },
};

// NOTE: Temporarily using OpenAI due to Gemini/Cloud Run issues (2026-02-06)

export function getAPIKeys() {
  return {
    gemini: process.env.GOOGLE_AI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
}

export function getAPIKey(provider: AIProvider): string | undefined {
  const keys = getAPIKeys();
  return keys[provider];
}

export function setGlobalProvider(provider: AIProvider, model?: string): void {
  const defaultModel = provider === 'openai' ? OPENAI_MODEL : 'gemini-2.0-flash-001';
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
