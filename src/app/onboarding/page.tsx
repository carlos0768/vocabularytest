'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  EIKEN_LEVEL_OPTIONS,
  HandleSuggestionRow,
  LevelChip,
  SignupErrorMessage,
  SignupFormField,
  SignupLoadingScreen,
  SignupPrimaryAction,
  SignupStepShell,
  type SignupStepTheme,
} from '@/components/auth/SignupStepUi';
import {
  DesktopAuthError,
  DesktopAuthField,
  DesktopAuthPrimaryButton,
  DesktopAuthShell,
} from '@/components/desktop/DesktopAuth';
import { useAuth } from '@/hooks/use-auth';
import { useHandlePicker } from '@/hooks/use-handle-picker';
import { usePageBackground } from '@/hooks/use-page-background';
import {
  buildOnboardingPath,
  resolveOnboardingNextPath,
  suggestDisplayNameFromMetadata,
} from '@/lib/auth/onboarding-profile';
import {
  clearPendingOnboarding,
  readPendingOnboarding,
} from '@/lib/auth/pending-onboarding';
import {
  resolveSignupRouteError,
  validateOnboardingData,
  type EikenLevelOption,
  type OnboardingData,
} from '@/lib/auth/signup-flow';

/**
 * Onboarding profile for accounts created without the signup screens — an
 * OAuth (Google / Apple) signup from /login, or one from /signup whose
 * onboarding cookie did not survive the provider round-trip. The auth
 * callback sends such users here (`needsOnboardingProfile`) before they enter
 * the app; the fields are the same as on /signup and are saved through
 * POST /api/onboarding/profile, which also seeds the default wordbooks for
 * the chosen EIKEN level.
 */

const ONBOARDING_BG = 'var(--color-paper-alt)';
const STEPS = ['profile', 'level'] as const;
type OnboardingStep = typeof STEPS[number];

const STEP_THEMES: Record<OnboardingStep, SignupStepTheme> = {
  profile: { icon: 'person', label: 'PROFILE', accent: '#15803d', accentSub: '#dcfce7' },
  level: { icon: 'flag', label: 'GOAL', accent: '#b45309', accentSub: '#fef3c7' },
};
const STEP_BAR_COLORS = ['#15803d', '#b45309'] as const;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function OnboardingForm() {
  usePageBackground(ONBOARDING_BG);

  const router = useRouter();
  const searchParams = useSearchParams();
  const next = resolveOnboardingNextPath(searchParams.get('next'));
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [step, setStep] = useState<OnboardingStep>('profile');
  const [displayName, setDisplayName] = useState('');
  const [eikenLevel, setEikenLevel] = useState<EikenLevelOption>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    userHandle,
    changeHandle,
    applySuggestion,
    handleAvailable,
    handleChecking,
    suggestions,
    suggestionsLoading,
    refreshSuggestions,
  } = useHandlePicker({ displayName, active: step === 'profile' });

  // Signed-out visitors go through login and come straight back here.
  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    router.replace(`/login?redirect=${encodeURIComponent(buildOnboardingPath(next))}`);
  }, [authLoading, isAuthenticated, next, router]);

  // Prefill once: what the user typed on /signup before the OAuth redirect
  // (stashed in sessionStorage) wins over the provider's profile name.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!user || prefilledRef.current) return;
    prefilledRef.current = true;

    const pending = readPendingOnboarding();
    if (pending) {
      setDisplayName(pending.displayName);
      setEikenLevel(pending.eikenLevel);
      if (pending.userHandle) changeHandle(pending.userHandle);
      return;
    }

    const suggested = suggestDisplayNameFromMetadata(user.user_metadata);
    if (suggested) setDisplayName(suggested);
  }, [user, changeHandle]);

  const onboardingValid =
    displayName.trim().length >= 1 &&
    /^[a-z0-9_]{3,20}$/.test(userHandle) &&
    handleAvailable !== false;

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

  const handleFinish = async () => {
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          user_handle: userHandle,
          eiken_level: eikenLevel,
        }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(resolveSignupRouteError(data, 'プロフィールの保存に失敗しました'));
        return;
      }

      clearPendingOnboarding();
      try {
        // Drop the cached profile so useProfile refetches the new name.
        sessionStorage.removeItem('merken_profile_cache');
      } catch {
        // ignore
      }
      // Full navigation so every auth/profile singleton starts from the saved row.
      window.location.href = next;
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !isAuthenticated) {
    return <SignupLoadingScreen />;
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
              {EIKEN_LEVEL_OPTIONS.map((level) => (
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
            disabled={saving}
            onClick={() => void handleFinish()}
          >
            {saving ? '保存中...' : 'はじめる'}
          </DesktopAuthPrimaryButton>
          <button
            type="button"
            disabled={saving}
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
          <OnboardingShell
            step={step}
            title="受検何級に合格したいですか？"
            description="目標の級を選択してください。"
            onBack={() => {
              if (saving) return;
              setStep('profile');
              setError(null);
            }}
          >
            <div className="flex flex-col gap-3 px-6 pb-3">
              {error && <SignupErrorMessage>{error}</SignupErrorMessage>}

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
                  {EIKEN_LEVEL_OPTIONS.map((level) => (
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
              <SignupPrimaryAction
                type="button"
                disabled={saving}
                onClick={() => void handleFinish()}
              >
                {saving ? '保存中...' : 'はじめる'}
              </SignupPrimaryAction>
            </div>
          </OnboardingShell>
        </div>
      </>
    );
  }

  // ── Profile Step ────────────────────────────────────────
  return (
    <>
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
            suggestions={suggestions}
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
      </DesktopAuthShell>

      <div className="lg:hidden">
        <OnboardingShell
          step={step}
          title="プロフィール設定"
          description="ユーザー名とユーザーIDを設定してください。"
        >
          <div className="flex flex-col gap-3 px-6 pb-3">
            {error && <SignupErrorMessage>{error}</SignupErrorMessage>}

            <SignupFormField
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
                suggestions={suggestions}
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
            <SignupPrimaryAction
              type="button"
              disabled={!onboardingValid}
              onClick={handleProfileSubmit}
            >
              次へ進む
            </SignupPrimaryAction>
          </div>
        </OnboardingShell>
      </div>
    </>
  );
}

function OnboardingShell({
  step,
  ...rest
}: {
  step: OnboardingStep;
  title: string;
  description: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <SignupStepShell
      theme={STEP_THEMES[step]}
      stepIndex={STEPS.indexOf(step) + 1}
      totalSteps={STEPS.length}
      barColors={STEP_BAR_COLORS}
      {...rest}
    />
  );
}

function OnboardingFallback() {
  usePageBackground(ONBOARDING_BG);
  return <SignupLoadingScreen />;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingForm />
    </Suspense>
  );
}
