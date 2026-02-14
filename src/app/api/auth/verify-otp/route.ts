import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

// Service Role client for admin operations
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Server client for setting session cookies
async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

const MAX_ATTEMPTS = 5;
const requestSchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'メールアドレスと6桁の認証コードを入力してください',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { email, code } = parsed.data;

    const adminClient = getAdminClient();
    const normalizedEmail = email.toLowerCase();
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

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        { error: '認証コードが見つかりません。再度コードを送信してください。' },
        { status: 400 }
      );
    }

    // 有効期限チェック
    if (new Date(otpRecord.expires_at) < new Date()) {
      await adminClient
        .from('otp_requests')
        .delete()
        .eq('id', otpRecord.id);

      return NextResponse.json(
        { error: '認証コードの有効期限が切れました。再度コードを送信してください。' },
        { status: 400 }
      );
    }

    // 試行回数チェック
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      await adminClient
        .from('otp_requests')
        .delete()
        .eq('id', otpRecord.id);

      return NextResponse.json(
        { error: '試行回数の上限に達しました。再度コードを送信してください。' },
        { status: 400 }
      );
    }

    // コード検証
    if (otpRecord.otp_code !== normalizedCode) {
      // 試行回数をインクリメント
      await adminClient
        .from('otp_requests')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('id', otpRecord.id);

      const remainingAttempts = MAX_ATTEMPTS - otpRecord.attempts - 1;
      return NextResponse.json(
        { error: `認証コードが正しくありません。残り${remainingAttempts}回` },
        { status: 400 }
      );
    }

    // OTPを検証済みにする
    await adminClient
      .from('otp_requests')
      .update({ verified: true })
      .eq('id', otpRecord.id);

    // 既存ユーザーを確認
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    let userId: string;

    if (existingUser) {
      // 既存ユーザー
      userId = existingUser.id;
    } else {
      // 新規ユーザー作成
      const randomPassword = crypto.randomUUID(); // パスワードは使用しないがSupabaseの仕様上必要
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: randomPassword,
        email_confirm: true,
      });

      if (createError || !newUser.user) {
        console.error('Failed to create user:', createError);
        return NextResponse.json(
          { error: 'アカウントの作成に失敗しました' },
          { status: 500 }
        );
      }

      userId = newUser.user.id;
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
    const serverClient = await getServerClient();
    const { data: sessionData, error: sessionError } = await serverClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (sessionError || !sessionData.session) {
      console.error('Failed to verify OTP:', sessionError);
      return NextResponse.json(
        { error: 'ログインに失敗しました' },
        { status: 500 }
      );
    }

    // 使用済みOTPを削除
    await adminClient
      .from('otp_requests')
      .delete()
      .eq('email', normalizedEmail);

    return NextResponse.json({
      success: true,
      user: {
        id: sessionData.user?.id,
        email: sessionData.user?.email,
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
