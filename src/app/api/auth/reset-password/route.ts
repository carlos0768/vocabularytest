import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { sendOtpEmail, generateOtpCode } from '@/lib/resend/client';
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
const emailSchema = z.string().trim().email().max(254);
const codeSchema = z.string().trim().regex(/^\d{6}$/);
const passwordSchema = z.string().min(8).max(128);

const sendOtpSchema = z.object({
  action: z.literal('send-otp'),
  email: emailSchema,
}).strict();

const verifyOtpSchema = z.object({
  action: z.literal('verify-otp'),
  email: emailSchema,
  code: codeSchema,
}).strict();

const setPasswordSchema = z.object({
  action: z.literal('set-password'),
  email: emailSchema,
  code: codeSchema,
  newPassword: passwordSchema,
}).strict();

const requestSchema = z.discriminatedUnion('action', [
  sendOtpSchema,
  verifyOtpSchema,
  setPasswordSchema,
]);

// POST /api/auth/reset-password
// action: 'send-otp' | 'verify-otp' | 'set-password'
export async function POST(request: Request) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '不正なリクエストです',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.data;

    if (body.action === 'send-otp') {
      return handleSendOtp(body);
    }
    if (body.action === 'verify-otp') {
      return handleVerifyOtp(body);
    }
    return handleSetPassword(body);
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// Step 1: Send OTP to email
async function handleSendOtp({ email }: z.infer<typeof sendOtpSchema>) {
  const adminClient = getAdminClient();
  const normalizedEmail = email.toLowerCase();

  // Check if user exists
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existingUser = existingUsers?.users.find(
    (u) => u.email?.toLowerCase() === normalizedEmail
  );

  if (!existingUser) {
    // Don't reveal if user exists or not for security
    return NextResponse.json({
      success: true,
      message: '登録されているメールアドレスの場合、認証コードを送信しました',
    });
  }

  // Delete existing OTPs for this email
  await adminClient
    .from('otp_requests')
    .delete()
    .eq('email', normalizedEmail)
    .eq('verified', false);

  // Generate and save OTP
  const otpCode = generateOtpCode();
  const { error: insertError } = await adminClient
    .from('otp_requests')
    .insert({
      email: normalizedEmail,
      otp_code: otpCode,
      verified: false,
      attempts: 0,
    });

  if (insertError) {
    console.error('Failed to insert OTP:', insertError);
    return NextResponse.json({ error: '認証コードの生成に失敗しました' }, { status: 500 });
  }

  // Send email via Resend
  const emailResult = await sendOtpEmail({
    to: normalizedEmail,
    otpCode,
  });

  if (emailResult.error) {
    await adminClient
      .from('otp_requests')
      .delete()
      .eq('email', normalizedEmail)
      .eq('otp_code', otpCode);

    return NextResponse.json({ error: emailResult.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: '認証コードを送信しました',
  });
}

// Step 2: Verify OTP
async function handleVerifyOtp({ email, code }: z.infer<typeof verifyOtpSchema>) {
  const adminClient = getAdminClient();
  const normalizedEmail = email.toLowerCase();
  const normalizedCode = code;

  // Get OTP record
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

  // Check expiry
  if (new Date(otpRecord.expires_at) < new Date()) {
    await adminClient.from('otp_requests').delete().eq('id', otpRecord.id);
    return NextResponse.json(
      { error: '認証コードの有効期限が切れました。再度コードを送信してください。' },
      { status: 400 }
    );
  }

  // Check attempts
  if (otpRecord.attempts >= MAX_ATTEMPTS) {
    await adminClient.from('otp_requests').delete().eq('id', otpRecord.id);
    return NextResponse.json(
      { error: '試行回数の上限に達しました。再度コードを送信してください。' },
      { status: 400 }
    );
  }

  // Verify code
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

  // Mark as verified
  await adminClient
    .from('otp_requests')
    .update({ verified: true })
    .eq('id', otpRecord.id);

  return NextResponse.json({
    success: true,
    message: '認証コードを確認しました',
  });
}

// Step 3: Set new password
async function handleSetPassword({ email, newPassword }: z.infer<typeof setPasswordSchema>) {
  const adminClient = getAdminClient();
  const normalizedEmail = email.toLowerCase();

  // Verify OTP was already verified
  const { data: otpRecord, error: fetchError } = await adminClient
    .from('otp_requests')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('verified', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !otpRecord) {
    return NextResponse.json(
      { error: '認証が完了していません。最初からやり直してください。' },
      { status: 400 }
    );
  }

  // Check expiry (even for verified, don't allow old tokens)
  const expiryTime = new Date(otpRecord.expires_at);
  expiryTime.setMinutes(expiryTime.getMinutes() + 5); // Extra 5 min for password entry
  if (expiryTime < new Date()) {
    await adminClient.from('otp_requests').delete().eq('id', otpRecord.id);
    return NextResponse.json(
      { error: 'セッションが期限切れです。最初からやり直してください。' },
      { status: 400 }
    );
  }

  // Get user
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existingUser = existingUsers?.users.find(
    (u) => u.email?.toLowerCase() === normalizedEmail
  );

  if (!existingUser) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 400 });
  }

  // Update password
  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    existingUser.id,
    { password: newPassword }
  );

  if (updateError) {
    console.error('Failed to update password:', updateError);
    return NextResponse.json({ error: 'パスワードの更新に失敗しました' }, { status: 500 });
  }

  // Clean up OTP
  await adminClient
    .from('otp_requests')
    .delete()
    .eq('email', normalizedEmail);

  // Log the user in
  const serverClient = await getServerClient();
  const { error: signInError } = await serverClient.auth.signInWithPassword({
    email: normalizedEmail,
    password: newPassword,
  });

  if (signInError) {
    // Password was updated, but auto-login failed - still success
    return NextResponse.json({
      success: true,
      message: 'パスワードを更新しました。ログインしてください。',
      autoLogin: false,
    });
  }

  return NextResponse.json({
    success: true,
    message: 'パスワードを更新しました',
    autoLogin: true,
  });
}
