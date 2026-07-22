import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  buildAuthorizationRedirectUrl,
  generateAuthorizationCode,
  getChatGptOAuthConfig,
  hashAuthorizationCode,
  isAllowedRedirectUri,
  isChatGptOAuthConfigured,
  type ChatGptOAuthConfig,
} from '@/lib/oauth/chatgpt-actions';

/**
 * POST /api/oauth/authorize
 *
 * ChatGPT Custom GPT (GPT Actions) 向け OAuth 認可エンドポイント。
 * /oauth/authorize の同意画面から cookie セッション付きで呼ばれ、
 * 承認時に一時認可コードを発行して ChatGPT の callback URL へ返す。
 * redirect_uri は許可リスト完全一致のみ（OAuth 仕様に従い、不一致時は
 * リダイレクトせず 400 を返す）。
 */

const requestSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  redirectUri: z.string().trim().url().max(600),
  state: z.string().trim().max(600).optional(),
  scope: z.string().trim().max(200).optional(),
  decision: z.enum(['approve', 'deny']).default('approve'),
}).strict();

type AuthorizeDeps = {
  resolveUser: (request: NextRequest) => Promise<{ id: string } | null>;
  getConfig: () => ChatGptOAuthConfig;
  insertAuthorizationCode: (row: {
    codeHash: string;
    userId: string;
    clientId: string;
    redirectUri: string;
    scope: string | null;
  }) => Promise<void>;
};

const defaultDeps: AuthorizeDeps = {
  async resolveUser(request: NextRequest) {
    const supabase = await createRouteHandlerClient(request);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return { id: user.id };
  },
  getConfig: getChatGptOAuthConfig,
  async insertAuthorizationCode(row) {
    // oauth_authorization_codes は service-role 専用の内部テーブル
    // (anon/authenticated は明示 deny) のため admin client で書き込む。
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('oauth_authorization_codes')
      .insert({
        code_hash: row.codeHash,
        user_id: row.userId,
        client_id: row.clientId,
        redirect_uri: row.redirectUri,
        scope: row.scope,
      });

    if (error) {
      throw new Error(error.message || 'authorization_code_insert_failed');
    }
  },
};

export async function handleOAuthAuthorizePost(
  request: NextRequest,
  deps: AuthorizeDeps = defaultDeps,
) {
  try {
    const user = await deps.resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '認可リクエストが不正です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { clientId, redirectUri, state, scope, decision } = parsed.data;
    const config = deps.getConfig();

    if (!isChatGptOAuthConfigured(config)) {
      console.error('[oauth/authorize] ChatGPT OAuth env vars are not configured');
      return NextResponse.json(
        { success: false, error: 'ChatGPT連携は現在利用できません' },
        { status: 503 },
      );
    }

    if (clientId !== config.clientId) {
      return NextResponse.json({ success: false, error: 'クライアントIDが不正です' }, { status: 400 });
    }

    if (!isAllowedRedirectUri(redirectUri, config.allowedRedirectUris)) {
      return NextResponse.json(
        { success: false, error: 'リダイレクトURIが許可されていません' },
        { status: 400 },
      );
    }

    if (decision === 'deny') {
      return NextResponse.json({
        success: true,
        redirectUrl: buildAuthorizationRedirectUrl({
          redirectUri,
          error: 'access_denied',
          state: state ?? null,
        }),
      });
    }

    const code = generateAuthorizationCode();
    await deps.insertAuthorizationCode({
      codeHash: hashAuthorizationCode(code),
      userId: user.id,
      clientId,
      redirectUri,
      scope: scope ?? null,
    });

    return NextResponse.json({
      success: true,
      redirectUrl: buildAuthorizationRedirectUrl({
        redirectUri,
        code,
        state: state ?? null,
      }),
    });
  } catch (error) {
    console.error('[oauth/authorize] error:', error);
    return NextResponse.json({ success: false, error: '認可処理に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleOAuthAuthorizePost(request);
}
