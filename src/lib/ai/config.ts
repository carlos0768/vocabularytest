/**
 * AI Configuration
 *
 * 蜈ｨ縺ｦ縺ｮAI險ｭ螳壹ｒ荳蜈・ｮ｡逅・☆繧九ヵ繧｡繧､繝ｫ縲・
 * 繝｢繝・Ν繧貞､画峩縺吶ｋ蝣ｴ蜷医・縺薙％繧貞､画峩縺吶ｋ縺縺代〒OK縲・
 */

export type AIProvider = 'gemini' | 'openai';
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-1.5-pro' | 'gemini-1.5-flash';
export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  responseFormat?: 'json' | 'text';
}

export interface AIConfig {
  // 謚ｽ蜃ｺ繧ｿ繧ｹ繧ｯ蛻･縺ｮ險ｭ螳・
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
  // 繝・ヵ繧ｩ繝ｫ繝郁ｨｭ螳・
  defaults: {
    gemini: AIModelConfig;
    openai: AIModelConfig;
  };
}

/**
 * 繝・ヵ繧ｩ繝ｫ繝医・AI險ｭ螳・
 *
 * 繝｢繝・Ν繧貞､画峩縺励◆縺・ｴ蜷医・縲∬ｩｲ蠖薙☆繧九ち繧ｹ繧ｯ縺ｮ險ｭ螳壹ｒ螟画峩縺吶ｋ縺縺代・
 * 萓・ 蜊倩ｪ樊歓蜃ｺ繧竪PT-4o縺ｫ螟画峩縺励◆縺・ｴ蜷・
 *     AI_CONFIG.extraction.words.provider = 'openai'
 *     AI_CONFIG.extraction.words.model = 'gpt-4o'
 */
export const AI_CONFIG: AIConfig = {
  extraction: {
    // 蜊倩ｪ樊歓蜃ｺ・・ll mode・・
    words: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxOutputTokens: 65535,
    },
    // 辭溯ｪ樊歓蜃ｺ・・diom mode・・
    idioms: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxOutputTokens: 65535,
    },
    // 闍ｱ讀懊Ξ繝吶Ν蛻･謚ｽ蜃ｺ・・iken mode・・
    eiken: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxOutputTokens: 65535,
    },
    // 荳ｸ蜊ｰ蜊倩ｪ樊歓蜃ｺ・・ircled mode・・
    circled: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxOutputTokens: 65535,
    },
    // 譁・ｳ墓歓蜃ｺ・・谿ｵ髫主・逅・ｼ・
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
  // 繝・ヵ繧ｩ繝ｫ繝郁ｨｭ螳夲ｼ域眠縺励＞繧ｿ繧ｹ繧ｯ霑ｽ蜉譎ゅ↓菴ｿ逕ｨ・・
  defaults: {
    gemini: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
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
 * 迺ｰ蠅・､画焚縺九ｉAPI繧ｭ繝ｼ繧貞叙蠕・
 */
export function getAPIKeys() {
  return {
    gemini: process.env.GOOGLE_AI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
}

/**
 * 謖・ｮ壹＆繧後◆繝励Ο繝舌う繝繝ｼ縺ｮAPI繧ｭ繝ｼ繧貞叙蠕・
 */
export function getAPIKey(provider: AIProvider): string | undefined {
  const keys = getAPIKeys();
  return keys[provider];
}

/**
 * 蜈ｨ繝｢繝ｼ繝峨ｒ荳諡ｬ縺ｧ繝励Ο繝舌う繝繝ｼ螟画峩・医ユ繧ｹ繝育畑・・
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
