'use client';

import { useState, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { OtpInput } from '@/components/ui/OtpInput';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';

type Step = 'form' | 'otp';

function SignupForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { signIn } = useAuth();

  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP state
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Step 1: Send OTP
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください');
      return;
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        // 既存ユーザーの場合はそのままログイン
        if (data.existing_user) {
          const result = await signIn(email, password);
          if (result.error) {
            setError('このメールアドレスは既に登録されています。パスワードが正しくない場合はログインページからお試しください。');
            setLoading(false);
            return;
          }
          // ハードナビゲーションでcookieを確実にサーバーへ反映
          window.location.href = redirect;
          return;
        }
        setError(data.error || '認証コードの送信に失敗しました');
        setLoading(false);
        return;
      }

      setStep('otp');
      setResendCooldown(60);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP and create account
  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/signup-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode, password }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.error || 'アカウントの作成に失敗しました');
        setLoading(false);
        return;
      }

      // Registration + login successful - redirect
      // ハードナビゲーションでcookieを確実にサーバーへ反映
      window.location.href = redirect;
    } catch {
      setError('通信エラーが発生しました');
      setLoading(false);
    }
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (otpCode.length === 6 && !loading) {
      handleVerifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode]);

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.error || '再送信に失敗しました');
      } else {
        setOtpCode('');
        setResendCooldown(60);
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: OTP verification screen
  if (step === 'otp') {
    return (
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-black tracking-[0.08em] text-[var(--solid-ink)]">MERKEN<span className="ml-2 text-[var(--color-accent)]">.</span></h1>
          <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">Verify email</p>
        </div>

        <SolidPanel as="div" className="p-6">
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
              <Icon name="mail" size={28} className="text-[var(--solid-ink)]" />
            </div>
            <p className="text-[var(--color-muted)] text-sm">
              <span className="font-medium text-[var(--color-foreground)]">{email}</span>
              <br />
              に6桁の認証コードを送信しました
            </p>
          </div>

          {error && (
            <div className="bg-[var(--color-error-light)] text-[var(--color-error)] px-4 py-3 rounded-[var(--radius-lg)] mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="mb-6">
            <OtpInput
              value={otpCode}
              onChange={setOtpCode}
              disabled={loading}
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-[var(--color-muted)] text-sm mb-4">
              <Icon name="progress_activity" size={16} className="animate-spin" />
              アカウントを作成中...
            </div>
          )}

          <p className="text-sm text-[var(--color-warning)] bg-[var(--color-warning-light)] p-3 rounded-[var(--radius-md)] mb-4 text-center">
            メールが届かない場合、迷惑メールフォルダを確認してください
          </p>

          <div className="text-center">
            <button
              onClick={handleResendOtp}
              disabled={resendCooldown > 0 || loading}
              className="text-sm text-[var(--color-primary)] hover:underline disabled:text-[var(--color-muted)] disabled:no-underline"
            >
              {resendCooldown > 0
                ? `再送信まで ${resendCooldown}秒`
                : 'コードを再送信'}
            </button>
          </div>

          <button
            onClick={() => {
              setStep('form');
              setOtpCode('');
              setError(null);
            }}
            className="flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] mt-4"
          >
            <Icon name="arrow_back" size={16} />
            メールアドレスを変更
          </button>
        </SolidPanel>
      </div>
    );
  }

  // Step 1: Email + password form
  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <h1 className="font-display text-4xl font-black tracking-[0.08em] text-[var(--solid-ink)]">MERKEN<span className="ml-2 text-[var(--color-accent)]">.</span></h1>
        <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">Create account</p>
      </div>

      {/* Form */}
      <SolidPanel as="div" className="p-6">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="bg-[var(--color-error-light)] text-[var(--color-error)] px-4 py-3 rounded-[var(--radius-lg)] mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--color-foreground)] mb-1">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="solid-input w-full px-4 py-3"
              placeholder="email@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--color-foreground)] mb-1">
              パスワード
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="solid-input w-full px-4 py-3 pr-12"
                placeholder="8文字以上"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                {showPassword ? <Icon name="visibility_off" size={20} /> : <Icon name="visibility" size={20} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--color-foreground)] mb-1">
              パスワード（確認）
            </label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="solid-input w-full px-4 py-3"
              placeholder="パスワードを再入力"
            />
          </div>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full mt-6"
          size="lg"
        >
          {loading ? (
            <>
              <Icon name="progress_activity" size={20} className="mr-2 animate-spin" />
              送信中...
            </>
          ) : (
            '認証コードを送信'
          )}
        </Button>
      </form>
      </SolidPanel>

      {/* Login link */}
      <p className="text-center text-[var(--color-muted)] mt-6">
        すでにアカウントをお持ちの方は{' '}
        <Link href={`/login?redirect=${encodeURIComponent(redirect)}`} className="text-[var(--color-primary)] hover:underline font-medium">
          ログイン
        </Link>
      </p>

      {/* Back to home */}
      <p className="text-center mt-4">
        <Link href="/" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] text-sm">
          ← ホームに戻る
        </Link>
      </p>
    </div>
  );
}

function SignupFormFallback() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="font-display text-4xl font-black tracking-[0.08em] text-[var(--solid-ink)]">MERKEN<span className="ml-2 text-[var(--color-accent)]">.</span></h1>
        <p className="text-[var(--color-muted)] mt-2">新規アカウント作成</p>
      </div>
      <SolidPanel as="div" className="p-6">
        <div className="flex items-center justify-center py-8">
          <Icon name="progress_activity" size={32} className="text-[var(--color-primary)] animate-spin" />
        </div>
      </SolidPanel>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] p-4">
      <Suspense fallback={<SignupFormFallback />}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
