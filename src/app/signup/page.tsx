'use client';

import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { OAuthProviderButtons } from '@/components/auth/OAuthProviderButtons';
import {
  DesktopAuthError,
  DesktopAuthField,
  DesktopAuthOAuth,
  DesktopAuthPrimaryButton,
  DesktopAuthShell,
} from '@/components/desktop/DesktopAuth';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui/Icon';
import { OtpInput } from '@/components/ui/OtpInput';
import {
  SIGNUP_OTP_LENGTH,
  SIGNUP_RESEND_COOLDOWN_SECONDS,
  buildSignupOtpRequestBody,
  buildSignupVerifyRequestBody,
  isSignupOtpComplete,
  resolveSignupRouteError,
  validateSignupCredentials,
  type SignupStep,
} from '@/lib/auth/signup-flow';

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function SignupForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [step, setStep] = useState<SignupStep>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setError(null);
    const validation = validateSignupCredentials({ password, confirmPassword });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSignupOtpRequestBody(email)),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(resolveSignupRouteError(data, '認証コードの送信に失敗しました'));
        return;
      }

      setOtpCode('');
      setStep('otp');
      setResendCooldown(SIGNUP_RESEND_COOLDOWN_SECONDS);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (loading || !isSignupOtpComplete(otpCode)) return;

    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/signup-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSignupVerifyRequestBody({
          email,
          code: otpCode,
          password,
        })),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(resolveSignupRouteError(data, 'アカウントの作成に失敗しました'));
        return;
      }

      window.location.href = redirect;
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (loading || resendCooldown > 0) return;

    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSignupOtpRequestBody(email)),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(resolveSignupRouteError(data, '再送信に失敗しました'));
        return;
      }

      setOtpCode('');
      setResendCooldown(SIGNUP_RESEND_COOLDOWN_SECONDS);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <>
        <DesktopAuthShell
          title="メールを確認"
          description="届いた6桁の認証コードを入力してください。"
        >
          <div className="ds-card" style={{ padding: 20, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div className="ds-avatar" style={{ width: 42, height: 42, borderRadius: 11 }}>
                <Icon name="mail" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: 'var(--solid-ink)' }}>認証コードを送信しました</div>
                <div className="muted" style={{ marginTop: 2, fontSize: 13, overflowWrap: 'anywhere' }}>{email}</div>
              </div>
            </div>
            {error && <DesktopAuthError>{error}</DesktopAuthError>}
            <OtpInput
              length={SIGNUP_OTP_LENGTH}
              value={otpCode}
              onChange={setOtpCode}
              disabled={loading}
            />
            <DesktopAuthPrimaryButton
              type="button"
              variant="accent"
              disabled={loading || !isSignupOtpComplete(otpCode)}
              onClick={handleVerifyOtp}
            >
              {loading ? '確認中...' : '登録を完了する'}
            </DesktopAuthPrimaryButton>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 12.5 }}>
            <button
              type="button"
              onClick={() => {
                setStep('form');
                setOtpCode('');
                setError(null);
              }}
              style={{ color: 'var(--color-muted)', fontWeight: 700 }}
            >
              メールアドレスを変更
            </button>
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={loading || resendCooldown > 0}
              style={{ color: resendCooldown > 0 ? 'var(--color-muted)' : 'var(--color-accent)', fontWeight: 700 }}
            >
              {resendCooldown > 0 ? `再送信 ${resendCooldown}秒` : 'コードを再送信'}
            </button>
          </div>
        </DesktopAuthShell>

        <div className="lg:hidden">
          <SignupShell
            stepLabel="2/2"
            title="メールを確認"
            description="届いた6桁の認証コードを入力してください。"
            onBack={() => {
              setStep('form');
              setOtpCode('');
              setError(null);
            }}
          >
            <SolidPanel className="mx-6 !rounded-xl" faceClassName="!p-4">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white">
                  <Icon name="mail" size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[var(--solid-ink)]">認証コードを送信しました</div>
                  <div className="mt-1 break-all text-xs leading-5 text-[var(--color-muted)]">{email}</div>
                </div>
              </div>

              {error && <ErrorMessage>{error}</ErrorMessage>}

              <div className="py-2">
                <OtpInput
                  length={SIGNUP_OTP_LENGTH}
                  value={otpCode}
                  onChange={setOtpCode}
                  disabled={loading}
                />
              </div>

              <div className="mt-4">
                <PrimaryAction
                  type="button"
                  disabled={loading || !isSignupOtpComplete(otpCode)}
                  onClick={handleVerifyOtp}
                >
                  {loading ? '確認中...' : '登録を完了する'}
                </PrimaryAction>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setStep('form');
                    setOtpCode('');
                    setError(null);
                  }}
                  className="font-bold text-[var(--color-muted)]"
                >
                  メールアドレスを変更
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || resendCooldown > 0}
                  className="font-bold text-[var(--color-accent)] disabled:text-[var(--color-muted)]"
                >
                  {resendCooldown > 0 ? `再送信 ${resendCooldown}秒` : 'コードを再送信'}
                </button>
              </div>
            </SolidPanel>
          </SignupShell>
        </div>
      </>
    );
  }

  return (
    <>
      <DesktopAuthShell
        title="アカウントを作成"
        description="無料で始められます。クレジットカード不要。"
      >
        <form onSubmit={handleSubmit}>
          {error && <DesktopAuthError>{error}</DesktopAuthError>}
          <DesktopAuthField
            label="メールアドレス"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            disabled={loading}
          />
          <DesktopAuthField
            label="パスワード"
            placeholder="8文字以上"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            disabled={loading}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--color-muted)' }}
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? '非表示' : '表示'}
              </button>
            }
          />
          <DesktopAuthField
            label="パスワード（確認）"
            placeholder="もう一度入力"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            disabled={loading}
          />
          <DesktopAuthPrimaryButton
            variant="accent"
            disabled={
              loading ||
              email.trim().length === 0 ||
              password.length === 0 ||
              confirmPassword.length === 0
            }
          >
            {loading ? '送信中...' : '無料で始める'}
          </DesktopAuthPrimaryButton>
        </form>

        <DesktopAuthOAuth
          redirectPath={redirect}
          disabled={loading}
          onError={(message) => setError(message || null)}
        />

        <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 1.6 }}>
          登録すると
          <Link href="/terms" style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>利用規約</Link>
          と
          <Link href="/privacy" style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>プライバシーポリシー</Link>
          に同意したものとみなされます。
        </div>
        <div className="muted" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 16 }}>
          すでにアカウントをお持ちの方は{' '}
          <Link
            href={`/login?redirect=${encodeURIComponent(redirect)}`}
            style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none' }}
          >
            ログイン
          </Link>
        </div>
      </DesktopAuthShell>

      <div className="lg:hidden">
        <SignupShell
          stepLabel="1/2"
          title="新規登録"
          description="メールアドレスとパスワードでアカウントを作成します。"
          backHref="/"
        >
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2.5 px-6 pb-3">
              {error && <ErrorMessage>{error}</ErrorMessage>}

              <FormField
                label="メールアドレス"
                placeholder="kenta@example.com"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                disabled={loading}
              />

              <FormField
                label="パスワード"
                placeholder="8文字以上"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                disabled={loading}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="font-mono text-[10px] font-bold text-[var(--color-muted)]"
                    aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  >
                    {showPassword ? '非表示' : '表示'}
                  </button>
                }
              />

              <FormField
                label="パスワード（確認）"
                placeholder="もう一度入力"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            <div className="px-6 pb-4">
              <PrimaryAction
                type="submit"
                disabled={
                  loading ||
                  email.trim().length === 0 ||
                  password.length === 0 ||
                  confirmPassword.length === 0
                }
              >
                {loading ? '送信中...' : '認証コードを送信'}
              </PrimaryAction>
            </div>
          </form>

          <OAuthProviderButtons
            redirectPath={redirect}
            disabled={loading}
            onError={(message) => setError(message || null)}
          />

          <div className="flex items-center gap-2.5 px-6 pb-3.5 pt-1.5">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <span className="font-mono text-[10px] text-[var(--color-muted)]">または</span>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <div className="flex flex-col gap-2 px-6 pb-3">
            <Link
              href={`/login?redirect=${encodeURIComponent(redirect)}`}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-white px-3 py-3 text-[13px] font-bold text-[var(--solid-ink)]"
            >
              <Icon name="login" size={16} />
              ログインする
            </Link>
          </div>
        </SignupShell>
      </div>
    </>
  );
}

function SignupShell({
  stepLabel,
  title,
  description,
  backHref,
  onBack,
  children,
}: {
  stepLabel: string;
  title: string;
  description: string;
  backHref?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const backClassName = 'flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px';

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-[var(--color-background)] pt-3 font-[var(--font-body)]">
      <div className="flex items-center gap-2 px-[14px] pt-1">
        {backHref ? (
          <Link href={backHref} className={backClassName} aria-label="戻る">
            <Icon name="chevron_left" size={16} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onBack}
            className={backClassName}
            aria-label="戻る"
          >
            <Icon name="chevron_left" size={16} />
          </button>
        )}
        <div className="flex-1" />
        <div className="mr-1.5 flex items-center gap-1">
          <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--color-muted)]">
            {stepLabel}
          </span>
          <div className="flex gap-[3px]">
            {[1, 2].map((item) => (
              <div
                key={item}
                className="h-1 w-[18px] rounded-sm"
                style={{
                  background:
                    Number(stepLabel[0]) >= item
                      ? 'var(--solid-ink)'
                      : 'rgba(26,26,26,0.15)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 pb-2 pt-6 text-center">
        <div className="inline-block font-display text-[38px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
          MERKEN
          <span className="ml-[5px] inline-block h-[7px] w-[7px] -translate-y-3 bg-[var(--color-accent)]" />
        </div>
      </div>

      <div className="px-6 pb-4 pt-6">
        <div className="font-display text-2xl font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--solid-ink)]">
          {title}
        </div>
        <div className="mt-1 text-xs text-[var(--color-muted)]">{description}</div>
      </div>

      {children}

      <div className="flex-1" />
    </div>
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div
      aria-live="polite"
      className="rounded-[10px] border-2 border-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2.5 text-xs font-bold text-[var(--color-error)]"
    >
      {children}
    </div>
  );
}

function PrimaryAction({
  type,
  disabled,
  onClick,
  children,
}: {
  type: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="group relative w-full disabled:pointer-events-none disabled:opacity-60"
    >
      <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)] transition-transform group-active:translate-x-[1px] group-active:translate-y-[1px]" />
      <div className="relative flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3.5 text-center text-sm font-bold text-white">
        {children}
      </div>
    </button>
  );
}

function SignupFallback() {
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col items-center justify-center bg-[var(--color-background)] font-[var(--font-body)]">
      <Icon name="progress_activity" size={28} className="animate-spin text-[var(--solid-ink)]" />
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupForm />
    </Suspense>
  );
}

function FormField({
  label,
  placeholder,
  type,
  trailing,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  label: string;
  placeholder: string;
  type?: string;
  trailing?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-[5px] pl-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="flex items-center gap-2 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-[11px]">
        <input
          type={type || 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
          autoComplete={autoComplete}
          disabled={disabled}
          className="flex-1 border-none bg-transparent text-[13px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)] disabled:opacity-60"
        />
        {trailing}
      </div>
    </label>
  );
}
