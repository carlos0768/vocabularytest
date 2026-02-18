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
    const { prompt, systemPrompt, image, config } = request;

    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      // Add system prompt if provided
      if (systemPrompt) {
        messages.push({
          role: 'system',
          content: systemPrompt,
        });
      }

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

      const isGpt5Family =
        config.model.startsWith('gpt-5') || config.model.startsWith('gpt5');
      const response = await this.client.chat.completions.create({
        model: config.model,
        messages,
        ...(isGpt5Family ? {} : { temperature: config.temperature }),
        max_completion_tokens: config.maxOutputTokens,
        ...(config.responseFormat === 'json' && { response_format: { type: 'json_object' as const } }),
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
      const code = typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : '';

      if (error.status === 401 || message.includes('API key')) {
        throw new AIError('invalid_api_key', 'OpenAI APIキーが無効です', error);
      }
      if (error.status === 429 || message.includes('rate')) {
        throw new AIError('rate_limit', 'API制限に達しました', error);
      }
      if (code === 'unsupported_parameter' || code === 'unsupported_value') {
        throw new AIError('invalid_request', 'モデル設定パラメータが未対応です', error);
      }
      if (
        message.includes('image_url') &&
        (message.includes('application/pdf') || message.toLowerCase().includes('unsupported image'))
      ) {
        throw new AIError(
          'invalid_request',
          '現在の設定ではPDF解析に対応していません。PDFを画像（PNG/JPEG）に変換して再アップロードしてください。',
          error
        );
      }
      if (
        message.includes('model') &&
        (message.toLowerCase().includes('not found') ||
          message.toLowerCase().includes('does not exist') ||
          message.toLowerCase().includes('unavailable'))
      ) {
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
