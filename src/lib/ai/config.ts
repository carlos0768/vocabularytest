import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_GENERATION_MODEL,
  normalizeGeminiModel,
} from './gemini-model';

/**
 * AI Configuration
 *
 * 全てのAI設定を一元管理するファイル。
 * モデルを変更する場合はここを変更するだけでOK。
 */

export type AIProvider = 'gemini' | 'openai';
export type GeminiModel =
  | 'gemini-2.0-flash'
  | 'gemini-1.5-flash-002'
  | 'gemini-1.5-pro-002'
  | 'gemini-2.0-flash-001'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-3-flash-preview';
export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini';

const EXTRACTION_MODEL: GeminiModel = DEFAULT_GEMINI_FLASH_MODEL;
const QUESTION_GENERATION_MODEL: GeminiModel = DEFAULT_GEMINI_GENERATION_MODEL;
const OPENAI_MODEL: OpenAIModel = 'gpt-4o';

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
    highlighted: AIModelConfig;
    grammar: {
      ocr: AIModelConfig;
      analysis: AIModelConfig;
    };
  };
  lexicon: {
    translate: AIModelConfig;
    validateHint: AIModelConfig;
    classifyPos: AIModelConfig;
  };
  defaults: {
    gemini: AIModelConfig;
    openai: AIModelConfig;
  };
}

export const AI_CONFIG: AIConfig = {
  extraction: {
    words: {
      provider: 'gemini',
      model: EXTRACTION_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
    idioms: {
      provider: 'gemini',
      model: EXTRACTION_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
    eiken: {
      provider: 'gemini',
      model: EXTRACTION_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
    circled: {
      provider: 'gemini',
      model: EXTRACTION_MODEL,
      temperature: 0.0,
      maxOutputTokens: 16384,
    },
    highlighted: {
      provider: 'gemini',
      model: EXTRACTION_MODEL,
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
    grammar: {
      ocr: {
        provider: 'gemini',
        model: EXTRACTION_MODEL,
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
      analysis: {
        provider: 'gemini',
        model: EXTRACTION_MODEL,
        temperature: 0.7,
        maxOutputTokens: 16384,
      },
    },
  },
  lexicon: {
    translate: {
      provider: 'gemini',
      model: EXTRACTION_MODEL,
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
    validateHint: {
      provider: 'gemini',
      model: EXTRACTION_MODEL,
      temperature: 0,
      maxOutputTokens: 8192,
    },
    classifyPos: {
      provider: 'gemini',
      model: EXTRACTION_MODEL,
      temperature: 0,
      maxOutputTokens: 8192,
    },
  },
  defaults: {
    gemini: {
      provider: 'gemini',
      model: EXTRACTION_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
    openai: {
      provider: 'gemini',
      model: QUESTION_GENERATION_MODEL,
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
  },
};

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
  const defaultModel = provider === 'openai' ? OPENAI_MODEL : EXTRACTION_MODEL;
  const targetModel = provider === 'gemini'
    ? normalizeGeminiModel(model || defaultModel)
    : model || defaultModel;

  AI_CONFIG.extraction.words.provider = provider;
  AI_CONFIG.extraction.words.model = targetModel;

  AI_CONFIG.extraction.idioms.provider = provider;
  AI_CONFIG.extraction.idioms.model = targetModel;

  AI_CONFIG.extraction.eiken.provider = provider;
  AI_CONFIG.extraction.eiken.model = targetModel;

  AI_CONFIG.extraction.circled.provider = provider;
  AI_CONFIG.extraction.circled.model = targetModel;

  AI_CONFIG.extraction.highlighted.provider = provider;
  AI_CONFIG.extraction.highlighted.model = targetModel;

  AI_CONFIG.extraction.grammar.ocr.provider = provider;
  AI_CONFIG.extraction.grammar.ocr.model = targetModel;

  AI_CONFIG.extraction.grammar.analysis.provider = provider;
  AI_CONFIG.extraction.grammar.analysis.model = targetModel;
}
