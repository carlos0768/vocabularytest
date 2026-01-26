/**
 * Gemini AI Provider
 *
 * Google Gemini APIの実装。
 */

import { GoogleGenAI } from '@google/genai';
import type { AIModelConfig } from '../config';
import type { AIProvider, AIRequest, AIResponse } from './types';
import { AIError } from './types';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const { systemPrompt, prompt, image, config } = request;

    try {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      // System prompt + user promptを結合
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      parts.push({ text: fullPrompt });

      if (image) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType,
            data: image.base64,
          },
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const generateConfig: any = {
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
      };

      // JSON modeを設定
      if (config.responseFormat === 'json') {
        generateConfig.responseMimeType = 'application/json';
      }

      const response = await this.client.models.generateContent({
        model: config.model,
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        config: generateConfig,
      });

      const content = response.text;

      if (!content) {
        return {
          success: false,
          error: '画像を読み取れませんでした',
        };
      }

      return {
        success: true,
        content,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async generateText(prompt: string, config: AIModelConfig): Promise<AIResponse> {
    return this.generate({ prompt, config });
  }

  private handleError(error: unknown): AIResponse {
    console.error('Gemini API error:', error);

    // Check for status code in error object (ApiError from @google/genai)
    const errorObj = error as { status?: number; message?: string };
    const statusCode = errorObj.status;
    const message = errorObj.message || (error instanceof Error ? error.message : '');

    // Handle by status code first
    if (statusCode === 429 || message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      throw new AIError('rate_limit', 'API制限に達しました。しばらく待ってから再試行してください。', error);
    }

    if (statusCode === 401 || statusCode === 403) {
      throw new AIError('invalid_api_key', 'Gemini APIキーが無効です', error);
    }

    // Handle by message content
    if (message.includes('API key') || message.includes('API_KEY')) {
      throw new AIError('invalid_api_key', 'Gemini APIキーが無効です', error);
    }
    if (message.includes('quota') || message.includes('rate')) {
      throw new AIError('rate_limit', 'API制限に達しました。しばらく待ってから再試行してください。', error);
    }
    if (message.includes('did not match the expected pattern')) {
      throw new AIError('invalid_request', '画像データの処理に問題が発生しました', error);
    }
    if (message.includes('model') || message.includes('not found')) {
      throw new AIError('model_error', 'AIモデルが利用できません', error);
    }

    throw new AIError('unknown', '予期しないエラーが発生しました', error);
  }
}

/**
 * Geminiプロバイダーのファクトリー関数
 */
export function createGeminiProvider(apiKey: string): GeminiProvider {
  return new GeminiProvider(apiKey);
}
