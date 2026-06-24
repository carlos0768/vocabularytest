import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { sendOtpEmail, generateOtpCode } from '@/lib/resend/client';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { readSingleLineEnv } from '@/lib/env';
import {
  buildOtpInsertPayload,
  evaluateAuthOtpCode,
  evaluateResetPasswordVerifiedOtp,
  findAuthUserByNormalizedEmail,
  normalizeOtpEmail,
  resolveAuthOtpSendPolicy,
} from '@/lib/auth/otp-lifecycle';

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

export type ResetPasswordRouteDeps = {
  getAdminClient?: typeof getAdminClient;
  getServerClient?: typeof getServerClient;
  generateOtpCode?: typeof generateOtpCode;
  sendOtpEmail?: typeof sendOtpEmail;
};

// POST /api/auth/reset-password
// action: 'send-otp' | 'verify-otp' | 'set-password'
export async function POST(request: Request) {
  return handleResetPasswordPost(request);
}

export async function handleResetPasswordPost(
  request: Request,
  deps: ResetPasswordRouteDeps = {},
) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '不正なリクエストです',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.data;

    if (body.action === 'send-otp') {
      return handleSendOtp(body, deps);
    }
    if (body.action === 'verify-otp') {
      return handleVerifyOtp(body, deps);
    }
    return handleSetPassword(body, deps);
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// Step 1: Send OTP to email
async function handleSendOtp(
  { email }: z.infer<typeof sendOtpSchema>,
  deps: ResetPasswordRouteDeps,
) {
  const adminClient = (deps.getAdminClient ?? getAdminClient)();
  const normalizedEmail = normalizeOtpEmail(email);

  // Check if user exists
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existingUser = findAuthUserByNormalizedEmail(existingUsers?.users, normalizedEmail);
  const sendPolicy = resolveAuthOtpSendPolicy('reset-password', Boolean(existingUser));

  if (!sendPolicy.shouldSendOtp) {
    // Don't reveal if user exists or not for security
    return NextResponse.json(sendPolicy.response.body);
  }

  // Delete existing OTPs for this email
  await adminClient
    .from('otp_requests')
    .delete()
    .eq('email', normalizedEmail)
    .eq('verified', false);

  // Generate and save OTP
  const otpCode = (deps.generateOtpCode ?? generateOtpCode)();
  const { error: insertError } = await adminClient
    .from('otp_requests')
    .insert(buildOtpInsertPayload({ normalizedEmail, otpCode }));

  if (insertError) {
    console.error('Failed to insert OTP:', insertError);
    return NextResponse.json({ error: '認証コードの生成に失敗しました' }, { status: 500 });
  }

  // Send email via Resend
  const emailResult = await (deps.sendOtpEmail ?? sendOtpEmail)({
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
async function handleVerifyOtp(
  { email, code }: z.infer<typeof verifyOtpSchema>,
  deps: ResetPasswordRouteDeps,
) {
  const adminClient = (deps.getAdminClient ?? getAdminClient)();
  const normalizedEmail = normalizeOtpEmail(email);
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

  // Check expiry
  if (verificationResult.status === 'expired') {
    await adminClient.from('otp_requests').delete().eq('id', verificationResult.otpId);
    return NextResponse.json(
      verificationResult.response.body,
      { status: verificationResult.response.status }
    );
  }

  // Check attempts
  if (verificationResult.status === 'max_attempts') {
    await adminClient.from('otp_requests').delete().eq('id', verificationResult.otpId);
    return NextResponse.json(
      verificationResult.response.body,
      { status: verificationResult.response.status }
    );
  }

  // Verify code
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

  // Mark as verified
  await adminClient
    .from('otp_requests')
    .update(verificationResult.verifiedUpdate)
    .eq('id', verificationResult.otpId);

  return NextResponse.json({
    success: true,
    message: '認証コードを確認しました',
  });
}

// Step 3: Set new password
async function handleSetPassword(
  { email, newPassword }: z.infer<typeof setPasswordSchema>,
  deps: ResetPasswordRouteDeps,
) {
  const adminClient = (deps.getAdminClient ?? getAdminClient)();
  const normalizedEmail = normalizeOtpEmail(email);

  // Verify OTP was already verified
  const { data: otpRecord, error: fetchError } = await adminClient
    .from('otp_requests')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('verified', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const verifiedOtpResult = evaluateResetPasswordVerifiedOtp({
    otpRecord: fetchError ? null : otpRecord,
  });

  if (verifiedOtpResult.status === 'missing') {
    return NextResponse.json(
      verifiedOtpResult.response.body,
      { status: verifiedOtpResult.response.status }
    );
  }

  // Check expiry (even for verified, don't allow old tokens)
  if (verifiedOtpResult.status === 'expired') {
    await adminClient.from('otp_requests').delete().eq('id', verifiedOtpResult.otpId);
    return NextResponse.json(
      verifiedOtpResult.response.body,
      { status: verifiedOtpResult.response.status }
    );
  }

  // Get user
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existingUser = findAuthUserByNormalizedEmail(existingUsers?.users, normalizedEmail);

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
  const serverClient = await (deps.getServerClient ?? getServerClient)();
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
