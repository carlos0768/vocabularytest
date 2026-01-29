import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

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

export async function POST(request: Request) {
  try {
    const { email, code, password } = await request.json();

    if (!email || !code || !password) {
      return NextResponse.json(
        { error: 'メールアドレス、認証コード、パスワードを入力してください' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'パスワードは8文字以上で入力してください' },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = code.trim();

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

    // 既存ユーザーチェック
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

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
      console.error('Failed to create session:', sessionError);
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
    console.error('Signup verify error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
