import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readSingleLineEnv } from '@/lib/env';

/**
 * ChatGPT Custom GPT (GPT Actions) 向け OAuth 2.0 authorization code flow の
 * 純粋ヘルパー群。GPT Actions は authorization code grant のみ・PKCE なしの
 * confidential client として動作するため、client_id / client_secret は
 * 環境変数で単一クライアントとして管理する。
 */

export type ChatGptOAuthConfig = {
  clientId: string;
  clientSecret: string;
  allowedRedirectUris: string[];
};

export function parseAllowedRedirectUris(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function getChatGptOAuthConfig(
  env: Record<string, string | undefined> = process.env,
): ChatGptOAuthConfig {
  return {
    clientId: readSingleLineEnv('CHATGPT_OAUTH_CLIENT_ID', env),
    clientSecret: readSingleLineEnv('CHATGPT_OAUTH_CLIENT_SECRET', env),
    allowedRedirectUris: parseAllowedRedirectUris(
      readSingleLineEnv('CHATGPT_OAUTH_ALLOWED_REDIRECT_URIS', env),
    ),
  };
}

export function isChatGptOAuthConfigured(config: ChatGptOAuthConfig): boolean {
  return (
    config.clientId.length > 0
    && config.clientSecret.length > 0
    && config.allowedRedirectUris.length > 0
  );
}

// ChatGPT の callback URL は GPT ごとに固有で、OAuth 設定変更のたびに変わり得る。
// open redirect を防ぐため完全一致のみ許可する（ワイルドカード・前方一致は不可）。
export function isAllowedRedirectUri(redirectUri: string, allowedRedirectUris: string[]): boolean {
  if (!redirectUri) return false;
  return allowedRedirectUris.includes(redirectUri);
}

export function generateAuthorizationCode(): string {
  return randomBytes(32).toString('base64url');
}

// DB には平文コードを保存しない。突合は SHA-256 ハッシュで行う。
export function hashAuthorizationCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export type ClientCredentials = {
  clientId: string;
  clientSecret: string;
};

/**
 * GPT ビルダーの Token Exchange Method 2 方式に対応:
 * - "Default (POST request)": client_id / client_secret が body パラメータで届く
 * - "Basic authorization header": Authorization: Basic base64(client_id:client_secret)
 */
export function extractClientCredentials(input: {
  bodyClientId?: string | null;
  bodyClientSecret?: string | null;
  authorizationHeader?: string | null;
}): ClientCredentials | null {
  const header = input.authorizationHeader?.trim();
  if (header && header.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
      const separatorIndex = decoded.indexOf(':');
      if (separatorIndex > 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, separatorIndex)),
          clientSecret: decodeURIComponent(decoded.slice(separatorIndex + 1)),
        };
      }
    } catch {
      return null;
    }
  }

  const clientId = input.bodyClientId?.trim();
  const clientSecret = input.bodyClientSecret?.trim();
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  return null;
}

export function validateClientCredentials(
  credentials: ClientCredentials | null,
  config: ChatGptOAuthConfig,
): boolean {
  if (!credentials || !isChatGptOAuthConfigured(config)) return false;
  return (
    secretsMatch(credentials.clientId, config.clientId)
    && secretsMatch(credentials.clientSecret, config.clientSecret)
  );
}

export function buildAuthorizationRedirectUrl(input: {
  redirectUri: string;
  code?: string;
  error?: string;
  state?: string | null;
}): string {
  const url = new URL(input.redirectUri);
  if (input.code) {
    url.searchParams.set('code', input.code);
  }
  if (input.error) {
    url.searchParams.set('error', input.error);
  }
  if (input.state) {
    url.searchParams.set('state', input.state);
  }
  return url.toString();
}
