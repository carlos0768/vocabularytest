/**
 * AI Provider Factory
 *
 * プロバイダーの一元管理とファクトリー。
 * 直接 OpenAI / Gemini APIを呼ぶ。
 *
 * Cloud Runを使いたい場合は USE_CLOUD_RUN を true にして
 * CLOUD_RUN_URL / CLOUD_RUN_AUTH_TOKEN 環境変数を設定する。
 */

import type { AIProvider as AIProviderType } from '../config';
import type { AIProvider } from './types';
import { GeminiProvider, createGeminiProvider } from './gemini';
import { OpenAIProvider, createOpenAIProvider } from './openai';
import { CloudRunProvider } from './cloud-run';

// Re-export types and classes
export { AIError } from './types';
export type { AIProvider, AIRequest, AIResponse, AIErrorType } from './types';
export { GeminiProvider, createGeminiProvider } from './gemini';
export { OpenAIProvider, createOpenAIProvider } from './openai';
export { CloudRunProvider } from './cloud-run';

/**
 * Cloud Run使用フラグ（コード内で明示的に制御）
 * true にすると環境変数の CLOUD_RUN_URL / CLOUD_RUN_AUTH_TOKEN を参照する
 */
const USE_CLOUD_RUN = false;

const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL;
const CLOUD_RUN_AUTH_TOKEN = process.env.CLOUD_RUN_AUTH_TOKEN;
const useCloudRun = USE_CLOUD_RUN && !!(CLOUD_RUN_URL && CLOUD_RUN_AUTH_TOKEN);

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
 * CLOUD_RUN_URL設定時はCloud Run経由、未設定時は直接API呼び出し。
 *
 * @param provider プロバイダー名 ('gemini' | 'openai')
 * @param apiKey APIキー（Cloud Run使用時は無視される）
 * @returns AIプロバイダーインスタンス
 */
export function getProvider(provider: AIProviderType, apiKey: string): AIProvider {
  // Cloud Run経由モード
  if (useCloudRun) {
    const cacheKey = `cloudrun:${provider}`;
    const cached = providerCache.get(cacheKey);
    if (cached) return cached;

    const instance = new CloudRunProvider(provider, CLOUD_RUN_URL!, CLOUD_RUN_AUTH_TOKEN!);
    providerCache.set(cacheKey, instance);
    return instance;
  }

  // 直接API呼び出しモード（ローカル開発用）
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
  // Cloud Run使用時はAPIキー不要（Cloud Run側で管理）
  if (useCloudRun) {
    return getProvider(config.provider, 'cloud-run');
  }

  const apiKey = apiKeys[config.provider];

  if (!apiKey) {
    throw new Error(`API key not found for provider: ${config.provider}`);
  }

  return getProvider(config.provider, apiKey);
}
