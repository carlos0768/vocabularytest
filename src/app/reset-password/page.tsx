'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, ArrowLeft, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OtpInput } from '@/components/ui/OtpInput';

type Step = 'email' | 'otp' | 'password' | 'success';

export default function ResetPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-otp', email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '認証コードの送信に失敗しました');
        setLoading(false);
        return;
      }

      setStep('otp');
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-otp', email, code: otpCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '認証に失敗しました');
        setLoading(false);
        return;
      }

      setStep('password');
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('パスワードは8文字以上で入力してください');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-password', email, code: otpCode, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'パスワードの更新に失敗しました');
        setLoading(false);
        return;
      }

      if (data.autoLogin) {
        window.location.href = '/';
      } else {
        setStep('success');
      }
    } catch {
      setError('ネットワークエラーが発生しました');
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    setLoading(true);
    setOtpCode('');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-otp', email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '認証コードの再送信に失敗しました');
      }
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background)] p-4">
        <div className="bg-[var(--color-surface)] rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-[var(--color-success)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">
            パスワードを更新しました
          </h1>
          <p className="text-[var(--color-muted)] mb-6">
            新しいパスワードでログインしてください。
          </p>
          <Link href="/login">
            <Button className="w-full">
              ログインページへ
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background)] p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--color-foreground)]">MERKEN</h1>
          <p className="text-[var(--color-muted)] mt-2">
            {step === 'email' && 'パスワードをリセット'}
            {step === 'otp' && '認証コードを入力'}
            {step === 'password' && '新しいパスワードを設定'}
          </p>
        </div>

        {/* Form */}
        <div className="bg-[var(--color-surface)] rounded-2xl shadow-sm border border-[var(--color-border)] p-6">
          {error && (
            <div className="bg-[var(--color-error-light)] text-[var(--color-error)] px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          {step === 'email' && (
            <form onSubmit={handleSendOtp}>
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-[var(--color-foreground)] mb-1">
                  メールアドレス
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-muted)]" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-peach-light)] outline-none transition-all"
                    placeholder="email@example.com"
                  />
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-2">
                  登録済みのメールアドレスに認証コードを送信します
                  <br />
                  届かない場合は迷惑メールフォルダをご確認ください
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !email}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    送信中...
                  </>
                ) : (
                  '認証コードを送信'
                )}
              </Button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp}>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => { setStep('email'); setOtpCode(''); setError(null); }}
                  className="flex items-center text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] mb-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  メールアドレスを変更
                </button>

                <p className="text-sm text-[var(--color-muted)] mb-4 text-center">
                  <span className="font-medium text-[var(--color-foreground)]">{email}</span>
                  <br />
                  に送信した6桁のコードを入力してください
                </p>

                <OtpInput
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    確認中...
                  </>
                ) : (
                  '確認'
                )}
              </Button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                className="w-full mt-4 text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] disabled:opacity-50"
              >
                コードを再送信
              </button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handleSetPassword}>
              <div className="space-y-4 mb-6">
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-[var(--color-foreground)] mb-1">
                    新しいパスワード
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-peach-light)] outline-none transition-all pr-12"
                      placeholder="8文字以上"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

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
                    className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-peach-light)] outline-none transition-all"
                    placeholder="パスワードを再入力"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || !newPassword || !confirmPassword}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    更新中...
                  </>
                ) : (
                  'パスワードを更新'
                )}
              </Button>
            </form>
          )}
        </div>

        {/* Back to login */}
        <p className="text-center mt-6">
          <Link href="/login" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] text-sm">
            ← ログインに戻る
          </Link>
        </p>
      </div>
    </div>
  );
}
