'use client';

import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { OAuthProviderButtons } from '@/components/auth/OAuthProviderButtons';
import {
  EIKEN_LEVEL_OPTIONS as EIKEN_LEVELS,
  HandleSuggestionRow,
  LevelChip,
  SignupErrorMessage as ErrorMessage,
  SignupFormField as FormField,
  SignupLoadingScreen,
  SignupPrimaryAction as PrimaryAction,
  SignupStepShell,
  type SignupStepTheme,
} from '@/components/auth/SignupStepUi';
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
import { useHandlePicker } from '@/hooks/use-handle-picker';
import { usePageBackground } from '@/hooks/use-page-background';
import { NEW_USER_SIGNUP_ENABLED, SIGNUP_CLOSED_NOTICE } from '@/lib/auth/signup-feature-flag';

const SIGNUP_BG = 'var(--color-paper-alt)';

const STEP_THEMES: Record<SignupStep, SignupStepTheme> = {
  profile: { icon: 'person', label: 'PROFILE', accent: '#15803d', accentSub: '#dcfce7' },
  level: { icon: 'flag', label: 'GOAL', accent: '#b45309', accentSub: '#fef3c7' },
  form: { icon: 'mail', label: 'ACCOUNT', accent: '#6d28d9', accentSub: '#ede9fe' },
  otp: { icon: 'lock', label: 'VERIFY', accent: '#dc2626', accentSub: '#fee2e2' },
};

const STEP_BAR_COLORS = ['#15803d', '#b45309', '#6d28d9', '#dc2626'] as const;

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
  const [eikenLevel, setEikenLevel] = useState<EikenLevelOption>(null);
  const {
    userHandle,
    changeHandle,
    applySuggestion,
    handleAvailable,
    handleChecking,
    suggestions: handleSuggestions,
    suggestionsLoading,
    refreshSuggestions,
  } = useHandlePicker({ displayName, active: step === 'profile' });

  // Auth state
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-error-light)] text-[var(--color-danger)]">
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
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-3 text-[13px] font-bold text-[var(--solid-ink)]"
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
              onChange={(e) => changeHandle(e.target.value)}
              placeholder="kenta_123"
              autoComplete="username"
              style={{ paddingLeft: 30 }}
            />
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--color-muted)' }}>@</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 5 }}>
            半角英小文字・数字・アンダースコア（3〜20文字）
          </div>
          <HandleSuggestionRow
            suggestions={handleSuggestions}
            loading={suggestionsLoading}
            onPick={(candidate) => {
              applySuggestion(candidate);
              setError(null);
            }}
            onRefresh={refreshSuggestions}
          />
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
              <div className="flex items-center gap-0 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-[11px]">
                <span className="mr-1 text-sm font-bold text-[var(--color-muted)]">@</span>
                <input
                  type="text"
                  value={userHandle}
                  onChange={(e) => changeHandle(e.target.value)}
                  placeholder="kenta_123"
                  autoComplete="username"
                  className="flex-1 border-none bg-transparent text-[13px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
                />
              </div>
              <div className="mt-1 pl-0.5 text-[10px] text-[var(--color-muted)]">
                半角英小文字・数字・_（3〜20文字）
              </div>
              <HandleSuggestionRow
                suggestions={handleSuggestions}
                loading={suggestionsLoading}
                onPick={(candidate) => {
              applySuggestion(candidate);
              setError(null);
            }}
                onRefresh={refreshSuggestions}
              />
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
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-3 text-[13px] font-bold text-[var(--solid-ink)]"
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
  step,
  ...rest
}: {
  step: SignupStep;
  title: string;
  description: string;
  backHref?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <SignupStepShell
      theme={STEP_THEMES[step]}
      stepIndex={SIGNUP_STEPS.indexOf(step) + 1}
      totalSteps={SIGNUP_STEPS.length}
      barColors={STEP_BAR_COLORS}
      {...rest}
    />
  );
}

function SignupFallback() {
  usePageBackground(SIGNUP_BG);
  return <SignupLoadingScreen />;
}

/**
 * 新規受付停止中に `/signup` へ直接来た人 (ブックマーク・検索結果・古いリンク) に
 * 出す案内。フォームは一切出さず、ログインへだけ導く。
 */
function SignupClosedNotice() {
  usePageBackground(SIGNUP_BG);

  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const loginHref = `/login?redirect=${encodeURIComponent(redirect)}`;

  return (
    <>
      <DesktopAuthShell title="新規登録の受付停止中" description={SIGNUP_CLOSED_NOTICE}>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.8, marginBottom: 20 }}>
          再開まで今しばらくお待ちください。すでにアカウントをお持ちの方は、そのままログインしてご利用いただけます。
        </p>
        <Link
          href={loginHref}
          className="ds-btn dark"
          style={{ display: 'flex', justifyContent: 'center', textDecoration: 'none' }}
        >
          ログインへ
        </Link>
      </DesktopAuthShell>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-[var(--color-paper-alt)] pt-[calc(env(safe-area-inset-top,0px)+12px)] font-[var(--font-body)] [background-image:radial-gradient(color-mix(in_srgb,_var(--solid-ink)_4.5%,_transparent)_1px,transparent_1px)] [background-size:22px_22px] lg:hidden">
        <div className="px-[14px] pt-1">
          <Link
            href="/"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            aria-label="戻る"
          >
            <Icon name="chevron_left" size={16} />
          </Link>
        </div>

        <div className="px-6 pb-2 pt-6 text-center">
          <div className="inline-block font-display text-[38px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
            MERKEN
            <span className="ml-[5px] inline-block h-[7px] w-[7px] -translate-y-3 bg-[var(--color-accent)]" />
          </div>
        </div>

        <div className="px-6 pb-4 pt-6">
          <div className="font-display text-2xl font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--solid-ink)]">
            新規登録の受付停止中
          </div>
        </div>

        <div className="px-6 pb-4">
          <SolidPanel faceClassName="p-4">
            <p className="text-[13px] leading-6 text-[var(--solid-ink)]">
              {SIGNUP_CLOSED_NOTICE}
            </p>
            <p className="mt-2 text-[12px] leading-5 text-[var(--color-ink-soft)]">
              再開まで今しばらくお待ちください。すでにアカウントをお持ちの方は、そのままログインしてご利用いただけます。
            </p>
          </SolidPanel>
        </div>

        <div className="px-6 pb-4">
          <Link
            href={loginHref}
            className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3.5 text-center text-sm font-bold text-[var(--color-on-ink)] shadow-[3px_4px_0_#000] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_#000]"
          >
            <Icon name="login" size={16} />
            ログインへ
          </Link>
        </div>

        <div className="flex-1" />
      </div>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      {NEW_USER_SIGNUP_ENABLED ? <SignupForm /> : <SignupClosedNotice />}
    </Suspense>
  );
}
