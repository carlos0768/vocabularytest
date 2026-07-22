import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSingleLineEnv } from '@/lib/env';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  extractClientCredentials,
  getChatGptOAuthConfig,
  hashAuthorizationCode,
  validateClientCredentials,
  type ChatGptOAuthConfig,
} from '@/lib/oauth/chatgpt-actions';

/**
 * POST /api/oauth/token
 *
 * ChatGPT Custom GPT (GPT Actions) 向け OAuth トークンエンドポイント。
 * - grant_type=authorization_code: 認可コードを Supabase セッションに交換する。
 *   セッション鋳造は verify-otp と同じ generateLink(magiclink) → verifyOtp 機構。
 *   発行する access_token / refresh_token は Supabase のものをそのまま返すため、
 *   既存の Bearer 対応 API ルートがそのまま利用できる。
 * - grant_type=refresh_token: refresh token で新しいトークンペアを返す。
 *
 * レスポンス/エラー形式は RFC 6749 準拠 (ChatGPT が機械的に解釈するため、
 * このルートのエラーは日本語メッセージではなく OAuth エラーコードで返す)。
 */

type TokenParams = Record<string, string>;

type ClaimedAuthorizationCode = {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string | null;
};

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type TokenDeps = {
  getConfig: () => ChatGptOAuthConfig;
  claimAuthorizationCode: (codeHash: string) => Promise<ClaimedAuthorizationCode | null>;
  mintSessionForUser: (userId: string) => Promise<SessionTokens | null>;
  refreshSession: (refreshToken: string) => Promise<SessionTokens | null>;
};

// トークンを cookie に書かず JSON で返すため、セッションを永続化しない
// 匿名クライアントを都度生成する。
function createTokenExchangeClient(): SupabaseClient {
  const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const defaultDeps: TokenDeps = {
  getConfig: getChatGptOAuthConfig,
  async claimAuthorizationCode(codeHash: string) {
    // oauth_authorization_codes は service-role 専用の内部テーブルのため
    // admin client でアクセスする。used_at を条件付き UPDATE で埋めることで
    // ワンタイム性を原子的に保証する（二重交換は 0 行更新になる）。
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from('oauth_authorization_codes')
      .update({ used_at: nowIso })
      .eq('code_hash', codeHash)
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .select('user_id, client_id, redirect_uri, scope')
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      userId: data.user_id as string,
      clientId: data.client_id as string,
      redirectUri: data.redirect_uri as string,
      scope: (data.scope as string | null) ?? null,
    };
  },
  async mintSessionForUser(userId: string) {
    const admin = getSupabaseAdmin();

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (userError || !email) {
      console.error('[oauth/token] Failed to load user for session mint:', userError);
      return null;
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData) {
      console.error('[oauth/token] Failed to generate magic link:', linkError);
      return null;
    }

    const tokenClient = createTokenExchangeClient();
    const { data: sessionData, error: sessionError } = await tokenClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (sessionError || !sessionData.session) {
      console.error('[oauth/token] Failed to mint session:', sessionError);
      return null;
    }

    return {
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      expiresIn: sessionData.session.expires_in ?? 3600,
    };
  },
  async refreshSession(refreshToken: string) {
    const tokenClient = createTokenExchangeClient();
    const { data, error } = await tokenClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return null;
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in ?? 3600,
    };
  },
};

async function readTokenParams(request: NextRequest): Promise<TokenParams | null> {
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as unknown;
      if (typeof body !== 'object' || body === null) return null;
      const params: TokenParams = {};
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (typeof value === 'string') {
          params[key] = value;
        }
      }
      return params;
    }

    // GPT Actions は application/x-www-form-urlencoded で送信する
    const text = await request.text();
    const params: TokenParams = {};
    for (const [key, value] of new URLSearchParams(text)) {
      params[key] = value;
    }
    return params;
  } catch {
    return null;
  }
}

function oauthError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function tokenResponse(tokens: SessionTokens, scope: string | null) {
  return NextResponse.json(
    {
      access_token: tokens.accessToken,
      token_type: 'bearer',
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      ...(scope ? { scope } : {}),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function handleOAuthTokenPost(
  request: NextRequest,
  deps: TokenDeps = defaultDeps,
) {
  try {
    const params = await readTokenParams(request);
    if (!params) {
      return oauthError('invalid_request', 400);
    }

    const config = deps.getConfig();
    const credentials = extractClientCredentials({
      bodyClientId: params.client_id ?? null,
      bodyClientSecret: params.client_secret ?? null,
      authorizationHeader: request.headers.get('authorization'),
    });

    if (!validateClientCredentials(credentials, config)) {
      return oauthError('invalid_client', 401);
    }

    const grantType = params.grant_type ?? '';

    if (grantType === 'authorization_code') {
      const code = params.code ?? '';
      if (!code) {
        return oauthError('invalid_request', 400);
      }

      const claimed = await deps.claimAuthorizationCode(hashAuthorizationCode(code));
      if (!claimed) {
        return oauthError('invalid_grant', 400);
      }

      if (claimed.clientId !== config.clientId) {
        return oauthError('invalid_grant', 400);
      }

      if (params.redirect_uri && params.redirect_uri !== claimed.redirectUri) {
        return oauthError('invalid_grant', 400);
      }

      const tokens = await deps.mintSessionForUser(claimed.userId);
      if (!tokens) {
        return oauthError('invalid_grant', 400);
      }

      return tokenResponse(tokens, claimed.scope);
    }

    if (grantType === 'refresh_token') {
      const refreshToken = params.refresh_token ?? '';
      if (!refreshToken) {
        return oauthError('invalid_request', 400);
      }

      const tokens = await deps.refreshSession(refreshToken);
      if (!tokens) {
        return oauthError('invalid_grant', 400);
      }

      return tokenResponse(tokens, null);
    }

    return oauthError('unsupported_grant_type', 400);
  } catch (error) {
    console.error('[oauth/token] error:', error);
    return oauthError('server_error', 500);
  }
}

export async function POST(request: NextRequest) {
  return handleOAuthTokenPost(request);
}
