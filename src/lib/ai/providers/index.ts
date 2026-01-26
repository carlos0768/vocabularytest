/**
 * AI Provider Factory
 *
 * プロバイダーの一元管理とファクトリー。
 * 新しいプロバイダーを追加する場合はここに登録する。
 */

import type { AIProvider as AIProviderType } from '../config';
import type { AIProvider } from './types';
import { GeminiProvider, createGeminiProvider } from './gemini';
import { OpenAIProvider, createOpenAIProvider } from './openai';

// Re-export types and classes
export { AIError } from './types';
export type { AIProvider, AIRequest, AIResponse, AIErrorType } from './types';
export { GeminiProvider, createGeminiProvider } from './gemini';
export { OpenAIProvider, createOpenAIProvider } from './openai';

/**
 * プロバイダーのキャッシュ
 * 同じAPIキーで何度もインスタンスを作らないようにする
 */
const providerCache = new Map<string, AIProvider>();

/**
 * キャッシュキーを生成
 */
function getCacheKey(provider: AIProviderType, apiKey: string): string {
  return `${provider}:${apiKey.slice(0, 8)}`;
}

/**
 * プロバイダーを取得（キャッシュあり）
 *
 * @param provider プロバイダー名 ('gemini' | 'openai')
 * @param apiKey APIキー
 * @returns AIプロバイダーインスタンス
 *
 * @example
 * const provider = getProvider('gemini', process.env.GOOGLE_AI_API_KEY!);
 * const result = await provider.generate({ prompt, image, config });
 */
export function getProvider(provider: AIProviderType, apiKey: string): AIProvider {
  const cacheKey = getCacheKey(provider, apiKey);

  const cached = providerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let instance: AIProvider;

  switch (provider) {
    case 'gemini':
      instance = createGeminiProvider(apiKey);
      break;
    case 'openai':
      instance = createOpenAIProvider(apiKey);
      break;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  providerCache.set(cacheKey, instance);
  return instance;
}

/**
 * キャッシュをクリア（テスト用）
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

/**
 * 設定に基づいてプロバイダーを自動取得
 *
 * @param config AI設定
 * @param apiKeys APIキーのマップ
 * @returns AIプロバイダーインスタンス
 */
export function getProviderFromConfig(
  config: { provider: AIProviderType },
  apiKeys: { gemini?: string; openai?: string }
): AIProvider {
  const apiKey = apiKeys[config.provider];

  if (!apiKey) {
    throw new Error(`API key not found for provider: ${config.provider}`);
  }

  return getProvider(config.provider, apiKey);
}
