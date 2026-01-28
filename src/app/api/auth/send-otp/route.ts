import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendOtpEmail, generateOtpCode } from '@/lib/brevo/client';

// Service Role client for admin operations
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'メールアドレスを入力してください' },
        { status: 400 }
      );
    }

    // メールアドレスの簡易バリデーション
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '有効なメールアドレスを入力してください' },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const normalizedEmail = email.toLowerCase().trim();

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

    // Brevoでメール送信
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
