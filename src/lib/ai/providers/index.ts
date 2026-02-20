/**
 * AI Provider Factory
 *
 * プロバイダーの一元管理とファクトリー。
 * 直接 OpenAI / Gemini APIを呼ぶ。
 * CLOUD_RUN_URL + CLOUD_RUN_AUTH_TOKEN が両方ある場合は Cloud Run 経由で呼び出す。
 */

import type { AIProvider as AIProviderType } from '../config';
import type { AIProvider } from './types';
import { createGeminiProvider } from './gemini';
import { createOpenAIProvider } from './openai';
import { CloudRunProvider } from './cloud-run';

// Re-export types and classes
export { AIError } from './types';
export type { AIProvider, AIRequest, AIResponse, AIErrorType } from './types';
export { GeminiProvider, createGeminiProvider } from './gemini';
export { OpenAIProvider, createOpenAIProvider } from './openai';
export { CloudRunProvider } from './cloud-run';

/**
 * プロバイダーのキャッシュ
 * 同じAPIキーで何度もインスタンスを作らないようにする
 */
const providerCache = new Map<string, AIProvider>();

function getCloudRunConfig(): { url?: string; authToken?: string; enabled: boolean } {
  const url = process.env.CLOUD_RUN_URL?.trim();
  const authToken = process.env.CLOUD_RUN_AUTH_TOKEN?.trim();
  return {
    url,
    authToken,
    enabled: Boolean(url && authToken),
  };
}

export function isCloudRunConfigured(): boolean {
  return getCloudRunConfig().enabled;
}

/**
 * キャッシュキーを生成
 */
function getCacheKey(provider: AIProviderType, apiKey: string): string {
  return `${provider}:${(apiKey || 'no-key').slice(0, 8)}`;
}

/**
 * プロバイダーを取得（キャッシュあり）
 *
 * CLOUD_RUN_URL + CLOUD_RUN_AUTH_TOKEN 設定時は Cloud Run 経由、未設定時は直接API呼び出し。
 *
 * @param provider プロバイダー名 ('gemini' | 'openai')
 * @param apiKey APIキー（Cloud Run使用時は不要）
 * @returns AIプロバイダーインスタンス
 */
export function getProvider(provider: AIProviderType, apiKey = ''): AIProvider {
  const cloudRun = getCloudRunConfig();

  // Cloud Run経由モード
  if (cloudRun.enabled) {
    const cacheKey = `cloudrun:${provider}:${cloudRun.url}`;
    const cached = providerCache.get(cacheKey);
    if (cached) return cached;

    const instance = new CloudRunProvider(provider, cloudRun.url!, cloudRun.authToken!);
    providerCache.set(cacheKey, instance);
    return instance;
  }

  if (!apiKey) {
    throw new Error(`API key is required for provider: ${provider}`);
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
  if (isCloudRunConfigured()) {
    return getProvider(config.provider, 'cloud-run');
  }

  const apiKey = apiKeys[config.provider];

  if (!apiKey) {
    throw new Error(`API key not found for provider: ${config.provider}`);
  }

  return getProvider(config.provider, apiKey);
}
