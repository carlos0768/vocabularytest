/**
 * AI Provider Types
 *
 * 全てのAIプロバイダーが実装すべき共通インターフェース。
 * 新しいプロバイダー（Claude, Llama等）を追加する場合は、
 * このインターフェースを実装するだけでOK。
 */

import type { AIModelConfig } from '../config';

/**
 * AI呼び出しのリクエスト
 */
export interface AIRequest {
  systemPrompt?: string;
  prompt: string;
  image?: {
    base64: string;
    mimeType: string;
  };
  config: AIModelConfig;
}

/**
 * AI呼び出しのレスポンス
 */
export type AIResponse =
  | { success: true; content: string }
  | { success: false; error: string };

/**
 * AIプロバイダーのインターフェース
 *
 * 新しいプロバイダーを追加する場合は、このインターフェースを実装する。
 */
export interface AIProvider {
  /**
   * プロバイダー名
   */
  readonly name: string;

  /**
   * テキストと画像を入力として、AIを呼び出す
   */
  generate(request: AIRequest): Promise<AIResponse>;

  /**
   * テキストのみを入力として、AIを呼び出す（画像なし）
   */
  generateText(prompt: string, config: AIModelConfig): Promise<AIResponse>;
}

/**
 * エラーの種類
 */
export type AIErrorType =
  | 'invalid_api_key'
  | 'rate_limit'
  | 'invalid_request'
  | 'model_error'
  | 'network_error'
  | 'unknown';

/**
 * AI固有のエラー
 */
export class AIError extends Error {
  constructor(
    public readonly type: AIErrorType,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'AIError';
  }

  /**
   * ユーザー向けのエラーメッセージを取得
   */
  getUserMessage(): string {
    switch (this.type) {
      case 'invalid_api_key':
        return 'APIキーが無効です';
      case 'rate_limit':
        return 'API制限に達しました。しばらく待ってから再試行してください。';
      case 'invalid_request':
        return '画像の形式が不正です。別の画像をお試しください。';
      case 'model_error':
        return 'AIモデルが利用できません。しばらく待ってから再試行してください。';
      case 'network_error':
        return 'ネットワークエラーが発生しました。接続を確認してください。';
      default:
        return '画像の解析に失敗しました。もう一度お試しください。';
    }
  }
}
