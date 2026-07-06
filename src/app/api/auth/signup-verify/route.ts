import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { readSingleLineEnv } from '@/lib/env';
import { fetchDefaultOfficialWordbooksForLocalImport } from '@/lib/official-wordbooks/import-default';
import {
  evaluateAuthOtpCode,
  findAuthUserByNormalizedEmail,
  normalizeOtpEmail,
} from '@/lib/auth/otp-lifecycle';
import {
  hasSignupProfileFields,
  isUniqueSignupProfileViolation,
  saveSignupProfileFields,
} from '@/lib/auth/signup-profile';

// Service Role client for admin operations
function getAdminClient() {
  const supabaseUrl = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Server client for setting session cookies
async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL'),
    readSingleLineEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/),
  password: z.string().min(8).max(128),
  display_name: z.string().trim().min(1).max(30).optional(),
  user_handle: z.string().regex(/^[a-z0-9_]{3,20}$/).optional(),
  eiken_level: z.enum(['5', '4', '3', 'pre2', '2', 'pre1', '1']).nullable().optional(),
});

export type SignupVerifyRouteDeps = {
  getAdminClient?: typeof getAdminClient;
  getServerClient?: typeof getServerClient;
  fetchDefaultOfficialWordbooksForLocalImport?: typeof fetchDefaultOfficialWordbooksForLocalImport;
};

export async function POST(request: Request) {
  return handleSignupVerifyPost(request);
}

export async function handleSignupVerifyPost(
  request: Request,
  deps: SignupVerifyRouteDeps = {},
) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'メールアドレス、6桁の認証コード、8文字以上のパスワードを入力してください',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { email, code, password, display_name, user_handle, eiken_level } = parsed.data;

    const adminClient = (deps.getAdminClient ?? getAdminClient)();
    const normalizedEmail = normalizeOtpEmail(email);
    const normalizedCode = code;

    // OTPレコードを取得
    const { data: otpRecord, error: fetchError } = await adminClient
      .from('otp_requests')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const verificationResult = evaluateAuthOtpCode({
      otpRecord: fetchError ? null : otpRecord,
      code: normalizedCode,
    });

    if (verificationResult.status === 'missing') {
      return NextResponse.json(
        verificationResult.response.body,
        { status: verificationResult.response.status }
      );
    }

    // 有効期限チェック
    if (verificationResult.status === 'expired') {
      await adminClient
        .from('otp_requests')
        .delete()
        .eq('id', verificationResult.otpId);

      return NextResponse.json(
        verificationResult.response.body,
        { status: verificationResult.response.status }
      );
    }

    // 試行回数チェック
    if (verificationResult.status === 'max_attempts') {
      await adminClient
        .from('otp_requests')
        .delete()
        .eq('id', verificationResult.otpId);

      return NextResponse.json(
        verificationResult.response.body,
        { status: verificationResult.response.status }
      );
    }

    // コード検証
    if (verificationResult.status === 'invalid_code') {
      await adminClient
        .from('otp_requests')
        .update(verificationResult.attemptsUpdate)
        .eq('id', verificationResult.otpId);

      return NextResponse.json(
        verificationResult.response.body,
        { status: verificationResult.response.status }
      );
    }

    // OTPを検証済みにする
    await adminClient
      .from('otp_requests')
      .update(verificationResult.verifiedUpdate)
      .eq('id', verificationResult.otpId);

    // 既存ユーザーチェック
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = findAuthUserByNormalizedEmail(existingUsers?.users, normalizedEmail);

    if (existingUser) {
      // 使用済みOTPを削除
      await adminClient
        .from('otp_requests')
        .delete()
        .eq('email', normalizedEmail);

      return NextResponse.json(
        { error: 'このメールアドレスは既に登録されています。ログインしてください。' },
        { status: 409 }
      );
    }

    // 新規ユーザー作成（ユーザーが入力したパスワードで）
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true, // OTPで検証済みなのでメール確認済みとする
    });

    if (createError || !newUser.user) {
      console.error('Failed to create user:', createError);
      return NextResponse.json(
        { error: 'アカウントの作成に失敗しました' },
        { status: 500 }
      );
    }

    // Save onboarding profile fields if provided. Use upsert so the data is
    // persisted even if the auth trigger did not create a profile row.
    const userId = newUser.user.id;
    const profileFields = { display_name, user_handle, eiken_level };
    if (hasSignupProfileFields(profileFields)) {
      const profileError = await saveSignupProfileFields(adminClient, userId, profileFields);
      if (profileError) {
        console.error('Failed to save signup profile:', profileError);

        await adminClient
          .from('otp_requests')
          .delete()
          .eq('email', normalizedEmail);

        return NextResponse.json(
          {
            error: isUniqueSignupProfileViolation(profileError)
              ? 'このIDは既に使われています'
              : 'プロフィール情報の保存に失敗しました',
          },
          { status: isUniqueSignupProfileViolation(profileError) ? 409 : 500 },
        );
      }
    }

    // マジックリンクトークンを生成してセッションを作成
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    });

    if (linkError || !linkData) {
      console.error('Failed to generate magic link:', linkError);
      return NextResponse.json(
        { error: 'セッションの作成に失敗しました' },
        { status: 500 }
      );
    }

    // トークンを使ってセッションを設定
    const serverClient = await (deps.getServerClient ?? getServerClient)();
    const { data: sessionData, error: sessionError } = await serverClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (sessionError || !sessionData.session) {
      console.error('Failed to create session:', sessionError);
      return NextResponse.json(
        { error: 'ログインに失敗しました' },
        { status: 500 }
      );
    }

    let defaultOfficialWordbooks: Awaited<ReturnType<typeof fetchDefaultOfficialWordbooksForLocalImport>> = null;
    if (eiken_level !== undefined) {
      try {
        defaultOfficialWordbooks = await (
          deps.fetchDefaultOfficialWordbooksForLocalImport ?? fetchDefaultOfficialWordbooksForLocalImport
        )(
          adminClient,
          eiken_level,
        );
      } catch (defaultImportError) {
        console.error('Failed to fetch default official wordbooks:', defaultImportError);
      }
    }
    // 使用済みOTPを削除
    await adminClient
      .from('otp_requests')
      .delete()
      .eq('email', normalizedEmail);

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: sessionData.user?.email ?? newUser.user.email,
      },
      ...(defaultOfficialWordbooks ? { defaultOfficialWordbooks } : {}),
    });
  } catch (error) {
    console.error('Signup verify error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
