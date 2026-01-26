/**
 * OpenAI Provider
 *
 * OpenAI APIの実装。
 */

import OpenAI from 'openai';
import type { AIModelConfig } from '../config';
import type { AIProvider, AIRequest, AIResponse } from './types';
import { AIError } from './types';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const { prompt, image, config } = request;

    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (image) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${image.mimeType};base64,${image.base64}`,
              },
            },
          ],
        });
      } else {
        messages.push({
          role: 'user',
          content: prompt,
        });
      }

      const response = await this.client.chat.completions.create({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxOutputTokens,
      });

      const content = response.choices[0]?.message?.content;

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
    console.error('OpenAI API error:', error);

    if (error instanceof OpenAI.APIError) {
      const message = error.message;

      if (error.status === 401 || message.includes('API key')) {
        throw new AIError('invalid_api_key', 'OpenAI APIキーが無効です', error);
      }
      if (error.status === 429 || message.includes('rate')) {
        throw new AIError('rate_limit', 'API制限に達しました', error);
      }
      if (message.includes('model')) {
        throw new AIError('model_error', 'AIモデルが利用できません', error);
      }
    }

    if (error instanceof Error) {
      if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
        throw new AIError('network_error', 'ネットワークエラーが発生しました', error);
      }
    }

    throw new AIError('unknown', '予期しないエラーが発生しました', error);
  }
}

/**
 * OpenAIプロバイダーのファクトリー関数
 */
export function createOpenAIProvider(apiKey: string): OpenAIProvider {
  return new OpenAIProvider(apiKey);
}
