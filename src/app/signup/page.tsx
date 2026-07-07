'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
  SIGNUP_STEPS,
  buildSignupOtpRequestBody,
  buildSignupVerifyRequestBody,
  isSignupOtpComplete,
  resolveSignupRouteError,
  validateOnboardingData,
  validateSignupCredentials,
  type EikenLevelOption,
  type OnboardingData,
  type SignupStep,
} from '@/lib/auth/signup-flow';
import { storePendingOnboarding } from '@/lib/auth/pending-onboarding';
import type { SignupProfileFields } from '@/lib/auth/signup-profile';
import { usePageBackground } from '@/hooks/use-page-background';

const SIGNUP_BG = '#f3f0e9';

const STEP_THEMES: Record<SignupStep, {
  icon: string;
  label: string;
  accent: string;
  accentSub: string;
}> = {
  profile: { icon: 'person', label: 'PROFILE', accent: '#15803d', accentSub: '#dcfce7' },
  level: { icon: 'flag', label: 'GOAL', accent: '#b45309', accentSub: '#fef3c7' },
  form: { icon: 'mail', label: 'ACCOUNT', accent: '#6d28d9', accentSub: '#ede9fe' },
  otp: { icon: 'lock', label: 'VERIFY', accent: '#dc2626', accentSub: '#fee2e2' },
};

const STEP_BAR_COLORS = ['#15803d', '#b45309', '#6d28d9', '#dc2626'] as const;

const EIKEN_LEVELS: { value: EikenLevelOption; label: string }[] = [
  { value: '5', label: '5級' },
  { value: '4', label: '4級' },
  { value: '3', label: '3級' },
  { value: 'pre2', label: '準2級' },
  { value: '2', label: '2級' },
  { value: 'pre1', label: '準1級' },
  { value: '1', label: '1級' },
];

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function SignupForm() {
  usePageBackground(SIGNUP_BG);

  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [step, setStep] = useState<SignupStep>('profile');

  // Onboarding state
  const [displayName, setDisplayName] = useState('');
  const [userHandle, setUserHandle] = useState('');
  const [eikenLevel, setEikenLevel] = useState<EikenLevelOption>(null);
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [handleChecking, setHandleChecking] = useState(false);

  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const checkHandleAvailability = useCallback((handle: string) => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      setHandleAvailable(null);
      return;
    }
    setHandleChecking(true);
    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-handle?handle=${encodeURIComponent(handle)}`);
        const data = await res.json() as { available?: boolean };
        setHandleAvailable(data.available ?? false);
      } catch {
        setHandleAvailable(null);
      } finally {
        setHandleChecking(false);
      }
    }, 400);
  }, []);

  const handleUserHandleChange = (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUserHandle(normalized);
    setHandleAvailable(null);
    checkHandleAvailability(normalized);
  };

  const handleProfileSubmit = () => {
    setError(null);
    const onboarding: OnboardingData = { displayName, userHandle, eikenLevel };
    const validation = validateOnboardingData(onboarding);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (handleAvailable === false) {
      setError('このIDは既に使われています');
      return;
    }
    setStep('level');
  };

  const handleLevelSubmit = () => {
    setError(null);
    setStep('form');
  };

  // OAuth leaves this page before signup-verify can run, so stash the
  // onboarding profile for PendingOnboardingSync to apply after the redirect.
  const stashOnboardingForOAuth = () => {
    const onboarding: OnboardingData = { displayName, userHandle, eikenLevel };
    if (validateOnboardingData(onboarding).ok && handleAvailable !== false) {
      storePendingOnboarding(onboarding);
    }
  };

  // Carry the collected onboarding profile through the OAuth redirect in a
  // cookie so the auth callback persists it (and seeds default wordbooks)
  // server-side — the reliable channel when sessionStorage does not survive the
  // provider round-trip (PWA / in-app browser). A taken handle is dropped by the
  // callback, which still saves the name + level, so it is safe to include here.
  const oauthOnboardingFields: SignupProfileFields = {
    ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
    ...(userHandle && handleAvailable !== false ? { user_handle: userHandle } : {}),
    eiken_level: eikenLevel,
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
      const onboarding: OnboardingData = { displayName, userHandle, eikenLevel };
      const response = await fetch('/api/auth/signup-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSignupVerifyRequestBody({
          email,
          code: otpCode,
          password,
          onboarding,
        })),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(resolveSignupRouteError(data, 'アカウントの作成に失敗しました'));
        return;
      }

      // Default official wordbooks are now imported into Supabase server-side
      // by /api/auth/signup-verify; the client hydrates them via full sync.
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

  // ── OTP Step ─────────────────────────────────────────────
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
            step={step}
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[#fee2e2] text-[#dc2626]">
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

  // ── Form Step (email + password) ─────────────────────────
  if (step === 'form') {
    return (
      <>
        <DesktopAuthShell
          title="アカウントを作成"
          description="無料で始められます。クレジットカード不要。"
        >
          <form onSubmit={handleFormSubmit}>
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
              {loading ? '送信中...' : '認証コードを送信'}
            </DesktopAuthPrimaryButton>
          </form>

          <DesktopAuthOAuth
            redirectPath={redirect}
            disabled={loading}
            onError={(message) => setError(message || null)}
            onBeforeRedirect={stashOnboardingForOAuth}
            onboardingFields={oauthOnboardingFields}
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
            step={step}
            title="アカウント情報"
            description="メールアドレスとパスワードを入力してください。"
            onBack={() => {
              setStep('level');
              setError(null);
            }}
          >
            <form onSubmit={handleFormSubmit}>
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
              onBeforeRedirect={stashOnboardingForOAuth}
              onboardingFields={oauthOnboardingFields}
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

  // ── Level Step ───────────────────────────────────────────
  if (step === 'level') {
    return (
      <>
        <DesktopAuthShell
          title="受検何級に合格したいですか？"
          description="目標の級を選択してください。"
        >
          {error && <DesktopAuthError>{error}</DesktopAuthError>}
          <div className="ds-field">
            <label>合格したい級</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setEikenLevel(null)}
                className={`ds-chip ${eikenLevel === null ? 'active' : ''}`}
              >
                未定
              </button>
              {EIKEN_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setEikenLevel(level.value)}
                  className={`ds-chip ${eikenLevel === level.value ? 'active' : ''}`}
                >
                  {level.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 8 }}>
              あとから設定画面で変更できます。
            </div>
          </div>
          <DesktopAuthPrimaryButton
            type="button"
            variant="accent"
            onClick={handleLevelSubmit}
          >
            アカウント情報へ
          </DesktopAuthPrimaryButton>
          <button
            type="button"
            onClick={() => {
              setStep('profile');
              setError(null);
            }}
            style={{ display: 'block', margin: '14px auto 0', color: 'var(--color-muted)', fontSize: 12.5, fontWeight: 700 }}
          >
            ユーザー名とIDを修正
          </button>
        </DesktopAuthShell>

        <div className="lg:hidden">
          <SignupShell
            step={step}
            title="受検何級に合格したいですか？"
            description="目標の級を選択してください。"
            onBack={() => {
              setStep('profile');
              setError(null);
            }}
          >
            <div className="flex flex-col gap-3 px-6 pb-3">
              {error && <ErrorMessage>{error}</ErrorMessage>}

              <div>
                <div className="mb-[5px] pl-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
                  合格したい級
                </div>
                <div className="flex flex-wrap gap-[7px]">
                  <LevelChip
                    active={eikenLevel === null}
                    onClick={() => setEikenLevel(null)}
                  >
                    未定
                  </LevelChip>
                  {EIKEN_LEVELS.map((level) => (
                    <LevelChip
                      key={level.value}
                      active={eikenLevel === level.value}
                      onClick={() => setEikenLevel(level.value)}
                    >
                      {level.label}
                    </LevelChip>
                  ))}
                </div>
                <div className="mt-2 pl-0.5 text-[10px] leading-relaxed text-[var(--color-muted)]">
                  あとから設定画面で変更できます。
                </div>
              </div>
            </div>

            <div className="px-6 pb-4 pt-2">
              <PrimaryAction
                type="button"
                onClick={handleLevelSubmit}
              >
                アカウント情報へ
              </PrimaryAction>
            </div>
          </SignupShell>
        </div>
      </>
    );
  }

  // ── Profile Step ────────────────────────────────────────
  const onboardingValid =
    displayName.trim().length >= 1 &&
    /^[a-z0-9_]{3,20}$/.test(userHandle) &&
    handleAvailable !== false;

  return (
    <>
      {/* Desktop */}
      <DesktopAuthShell
        title="プロフィール設定"
        description="ユーザー名とユーザーIDを設定してください。"
      >
        {error && <DesktopAuthError>{error}</DesktopAuthError>}
        <DesktopAuthField
          label="ユーザー名"
          placeholder="山田太郎"
          type="text"
          value={displayName}
          onChange={setDisplayName}
          autoComplete="name"
          disabled={loading}
        />
        <div className="ds-field">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
            <label style={{ marginBottom: 0 }}>ユーザーID</label>
            {userHandle.length >= 3 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: handleChecking ? 'var(--color-muted)' : handleAvailable ? 'var(--color-accent)' : handleAvailable === false ? 'var(--color-error)' : 'var(--color-muted)' }}>
                {handleChecking ? '確認中...' : handleAvailable ? '利用可能' : handleAvailable === false ? '使用済み' : ''}
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              className="ds-input"
              type="text"
              value={userHandle}
              onChange={(e) => handleUserHandleChange(e.target.value)}
              placeholder="kenta_123"
              autoComplete="username"
              style={{ paddingLeft: 30 }}
            />
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--color-muted)' }}>@</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 5 }}>
            半角英小文字・数字・アンダースコア（3〜20文字）
          </div>
        </div>
        <DesktopAuthPrimaryButton
          type="button"
          variant="accent"
          disabled={!onboardingValid}
          onClick={handleProfileSubmit}
        >
          次へ進む
        </DesktopAuthPrimaryButton>
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

      {/* Mobile */}
      <div className="lg:hidden">
        <SignupShell
          step={step}
          title="プロフィール設定"
          description="ユーザー名とユーザーIDを設定してください。"
          backHref="/"
        >
          <div className="flex flex-col gap-3 px-6 pb-3">
            {error && <ErrorMessage>{error}</ErrorMessage>}

            <FormField
              label="ユーザー名"
              placeholder="山田太郎"
              type="text"
              value={displayName}
              onChange={setDisplayName}
              autoComplete="name"
            />

            <div>
              <div className="mb-[5px] flex items-center justify-between pl-0.5">
                <span className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
                  ユーザーID
                </span>
                {userHandle.length >= 3 && (
                  <span className={`text-[10px] font-bold ${handleChecking ? 'text-[var(--color-muted)]' : handleAvailable ? 'text-[var(--color-accent)]' : handleAvailable === false ? 'text-[var(--color-error)]' : 'text-[var(--color-muted)]'}`}>
                    {handleChecking ? '確認中...' : handleAvailable ? '利用可能' : handleAvailable === false ? '使用済み' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-[11px]">
                <span className="mr-1 text-sm font-bold text-[var(--color-muted)]">@</span>
                <input
                  type="text"
                  value={userHandle}
                  onChange={(e) => handleUserHandleChange(e.target.value)}
                  placeholder="kenta_123"
                  autoComplete="username"
                  className="flex-1 border-none bg-transparent text-[13px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
                />
              </div>
              <div className="mt-1 pl-0.5 text-[10px] text-[var(--color-muted)]">
                半角英小文字・数字・_（3〜20文字）
              </div>
            </div>
          </div>

          <div className="px-6 pb-4 pt-2">
            <PrimaryAction
              type="button"
              disabled={!onboardingValid}
              onClick={handleProfileSubmit}
            >
              次へ進む
            </PrimaryAction>
          </div>

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

const SHELL_CONFETTI = [
  { x: '8%', y: '13%', size: 9, color: '#15803d', rotate: -10 },
  { x: '91%', y: '9%', size: 7, color: '#b45309', rotate: 14 },
  { x: '94%', y: '30%', size: 10, color: '#dc2626', rotate: -12 },
  { x: '4%', y: '34%', size: 6, color: '#6d28d9', rotate: 20 },
] as const;

function SignupShell({
  step,
  title,
  description,
  backHref,
  onBack,
  children,
}: {
  step: SignupStep;
  title: string;
  description: string;
  backHref?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const backClassName = 'flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px';
  const theme = STEP_THEMES[step];
  const stepIndex = SIGNUP_STEPS.indexOf(step) + 1;
  const totalSteps = SIGNUP_STEPS.length;

  return (
    <div className="relative min-h-screen w-full bg-[#f3f0e9] font-[var(--font-body)] [background-image:radial-gradient(rgba(26,26,26,0.045)_1px,transparent_1px)] [background-size:22px_22px]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col overflow-hidden pb-4 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        {/* Decorative accent blobs + confetti */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-14 -top-12 h-36 w-36 rounded-full"
          style={{ background: theme.accent, opacity: 0.09 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-40 h-44 w-44 rounded-full"
          style={{ background: '#f59e0b', opacity: 0.1 }}
        />
        {SHELL_CONFETTI.map((c, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute rounded-[2px] border border-[var(--solid-ink)]"
            style={{
              left: c.x,
              top: c.y,
              width: c.size,
              height: c.size,
              background: c.color,
              transform: `rotate(${c.rotate}deg)`,
              opacity: 0.85,
            }}
          />
        ))}

        <div className="relative flex items-center gap-2 px-[14px] pt-1">
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
          <div className="mr-1.5 flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-bold tabular-nums text-[#8a857a]">
              {stepIndex}/{totalSteps}
            </span>
            <div className="flex gap-[3px]">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className="h-[6px] w-[20px] rounded-[3px] border border-[var(--solid-ink)]"
                  style={{
                    background:
                      stepIndex > i
                        ? STEP_BAR_COLORS[i] ?? 'var(--solid-ink)'
                        : 'rgba(255,255,255,0.7)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="relative px-6 pb-2 pt-6 text-center">
          <div className="inline-block font-display text-[38px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
            MERKEN
            <span className="ml-[5px] inline-block h-[7px] w-[7px] -translate-y-3 bg-[var(--color-accent)]" />
          </div>
        </div>

        <div className="relative px-6 pb-4 pt-5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-white px-2.5 py-[3px] font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--solid-ink)]"
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: theme.accent }}
            />
            STEP {stepIndex} · {theme.label}
          </span>
          <div className="mt-3 flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 -rotate-2 items-center justify-center rounded-[13px] border-2 border-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)]"
              style={{ background: theme.accentSub, color: theme.accent }}
            >
              <Icon name={theme.icon} size={24} />
            </div>
            <div className="min-w-0">
              <div className="font-display text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--solid-ink)]">
                {title}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-[#8a857a]">{description}</div>
            </div>
          </div>
        </div>

        {children}

        <div className="flex-1" />
      </div>
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
      className="group w-full disabled:pointer-events-none disabled:opacity-60"
    >
      <div className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] py-3.5 text-center text-sm font-bold text-white shadow-[3px_4px_0_var(--solid-ink)] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--solid-ink)]">
        {children}
      </div>
    </button>
  );
}

function LevelChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[10px] border-2 px-3.5 py-2 text-[12px] font-bold transition-all ${
        active
          ? 'border-[var(--solid-ink)] bg-[var(--color-accent)] text-white shadow-[2px_3px_0_var(--solid-ink)]'
          : 'border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]'
      }`}
    >
      {children}
    </button>
  );
}

function SignupFallback() {
  usePageBackground(SIGNUP_BG);

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-[#f3f0e9] font-[var(--font-body)] [background-image:radial-gradient(rgba(26,26,26,0.045)_1px,transparent_1px)] [background-size:22px_22px]">
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
      <div className="mb-[5px] pl-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-[#8a857a]">
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
