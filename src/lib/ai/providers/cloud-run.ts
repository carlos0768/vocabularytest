/**
 * Cloud Run Provider
 *
 * Cloud Run上のAIゲートウェイにリクエストを転送するプロバイダー。
 * CLOUD_RUN_URLが設定されている場合、GeminiもOpenAIもCloud Run経由になる。
 * 設定されていない場合は直接APIを呼ぶ（ローカル開発用）。
 */

import type { AIModelConfig } from '../config';
import type { AIProvider, AIRequest, AIResponse } from './types';
import { AIError } from './types';

export class CloudRunProvider implements AIProvider {
  readonly name: string;
  private url: string;
  private authToken: string;
  private providerName: string;

  constructor(providerName: string, url: string, authToken: string) {
    this.name = `cloud-run-${providerName}`;
    this.url = url;
    this.authToken = authToken;
    this.providerName = providerName;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const { systemPrompt, prompt, image, config } = request;

    try {
      const response = await fetch(`${this.url}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          provider: this.providerName,
          model: config.model,
          prompt,
          systemPrompt,
          image: image ? { base64: image.base64, mimeType: image.mimeType } : undefined,
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          responseFormat: config.responseFormat,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        return { success: false, error: data.error || 'AI processing failed' };
      }

      return { success: true, content: data.content };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async generateText(prompt: string, config: AIModelConfig): Promise<AIResponse> {
    return this.generate({ prompt, config });
  }

  private handleError(error: unknown): never {
    console.error('Cloud Run provider error:', error);

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('API key') || message.includes('401') || message.includes('403')) {
      throw new AIError('invalid_api_key', 'APIキーが無効です', error);
    }
    if (message.includes('429') || message.includes('rate') || message.includes('RESOURCE_EXHAUSTED')) {
      throw new AIError('rate_limit', 'API制限に達しました。しばらく待ってから再試行してください。', error);
    }
    if (message.includes('fetch') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
      throw new AIError('network_error', 'AIサービスへの接続に失敗しました', error);
    }
    if (message.includes('model') || message.includes('not found')) {
      throw new AIError('model_error', 'AIモデルが利用できません', error);
    }

    throw new AIError('unknown', '予期しないエラーが発生しました', error);
  }
}
