import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '有効なメールアドレスを入力してください',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { email } = parsed.data;

    const supabase = getAdminClient();
    const normalizedEmail = email.toLowerCase();

    // 既存ユーザーチェック
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (existingUser) {
      return NextResponse.json(
        { error: 'このメールアドレスは既に登録されています', existing_user: true },
        { status: 409 }
      );
    }

    // 既存の未検証OTPを無効化（同じメールアドレス）
    await supabase
      .from('otp_requests')
      .delete()
      .eq('email', normalizedEmail)
      .eq('verified', false);

    // 新しいOTPコードを生成
    const otpCode = generateOtpCode();

    // OTPをデータベースに保存
    const { error: insertError } = await supabase
      .from('otp_requests')
      .insert({
        email: normalizedEmail,
        otp_code: otpCode,
        verified: false,
        attempts: 0,
      });

    if (insertError) {
      console.error('Failed to insert OTP:', insertError);
      return NextResponse.json(
        { error: '認証コードの生成に失敗しました' },
        { status: 500 }
      );
    }

    // Resendでメール送信
    const emailResult = await sendOtpEmail({
      to: normalizedEmail,
      otpCode,
    });

    if (emailResult.error) {
      // メール送信失敗時はOTPレコードを削除
      await supabase
        .from('otp_requests')
        .delete()
        .eq('email', normalizedEmail)
        .eq('otp_code', otpCode);

      return NextResponse.json(
        { error: emailResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '認証コードを送信しました',
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
