'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, Button } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/components/theme-provider';
import { useWordCount } from '@/hooks/use-word-count';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { STRIPE_CONFIG } from '@/lib/stripe/config';
import { getSubscriptionDisplayDate } from '@/lib/subscription/display';
import { FREE_DAILY_SCAN_LIMIT, FREE_WORD_LIMIT } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscription, isPro, signOut, refresh, loading: authLoading, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const { count: wordCount, loading: wordCountLoading } = useWordCount();
  const {
    username,
    loading: profileLoading,
    saving: profileSaving,
    error: profileError,
    setUsername,
  } = useProfile();
  const {
    aiEnabled,
    loading: userPreferencesLoading,
    saving: userPreferencesSaving,
    error: userPreferencesError,
    setAiEnabled,
  } = useUserPreferences();
  const [usernameInput, setUsernameInput] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const hasCancellationScheduled = !!subscription?.cancelAtPeriodEnd;
  const isBillingPro = isPro && subscription?.proSource === 'billing';
  const isAppStorePro = isPro && subscription?.proSource === 'appstore';
  const subscriptionDisplayDate = getSubscriptionDisplayDate(subscription);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);

  // Save settings
  const updateTheme = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  const handleSignOut = async () => {
    if (!window.confirm('ログアウトしますか？')) return;
    await signOut();
    router.push('/');
  };

  const handleCancelAtPeriodEnd = async () => {
    const shouldProceed = window.confirm(
      '期間末で解約しますか？現在の契約期間が終了するまでPro機能は利用できます。'
    );
    if (!shouldProceed) return;

    setIsCancelling(true);
    setCancelError(null);
    setCancelSuccess(null);

    try {
      const response = await fetch('/api/subscription/cancel', { method: 'POST' });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error ?? '解約処理に失敗しました');
      }

      await refresh();
      setCancelSuccess(
        typeof result.message === 'string'
          ? result.message
          : '期間末解約を受け付けました。'
      );
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : '解約処理に失敗しました');
    } finally {
      setIsCancelling(false);
    }
  };

  const themeLabels: Record<Theme, string> = {
    light: 'ライト',
    dark: 'ダーク',
    system: 'システム',
  };

  return (
    <>
    <div className="min-h-screen pb-24 lg:pb-6">
      {/* iOS-style header */}
      <header className="px-5 pt-6 pb-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-3xl font-black text-[var(--color-foreground)]">設定</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 space-y-5">
        {/* ログイン中のメール・プラン（「プロフィール」とは別枠） */}
        {authLoading ? (
          <section>
            <h2 className="text-sm font-medium text-[var(--color-muted)] mb-3 px-1">ログイン情報</h2>
            <div className="card p-5 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--color-foreground)] border-t-transparent rounded-full animate-spin" />
            </div>
          </section>
        ) : isAuthenticated ? (
          <section>
            <h2 className="text-sm font-medium text-[var(--color-muted)] mb-3 px-1">ログイン情報</h2>
            <div className="card p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-[var(--color-border-light)] rounded-full flex items-center justify-center shrink-0">
                  <Icon name="mail" size={28} className="text-[var(--color-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isPro && <span className="text-sm">👑</span>}
                    <span className="text-sm font-medium text-[var(--color-muted)]">{isPro ? 'Pro' : 'Free'}</span>
                  </div>
                  <p className="font-bold text-[var(--color-foreground)] truncate">{user?.email}</p>
                  
                </div>
                {isPro && (
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="chip chip-pro text-xs">
                      <Icon name="add" size={12} />
                      Pro
                    </span>
                    <span className="text-xs text-[var(--color-muted)]">クラウド同期</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section>
            <h2 className="text-sm font-medium text-[var(--color-muted)] mb-3 px-1">サインイン</h2>
            <div className="card p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-[var(--color-border-light)] rounded-full flex items-center justify-center">
                  <Icon name="login" size={28} className="text-[var(--color-muted)]" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-[var(--color-foreground)]">ゲスト</p>
                  <p className="text-sm text-[var(--color-muted)]">ログインでクラウド同期</p>
                </div>
                <Link href="/login" className="px-5 py-2.5 rounded-xl bg-[var(--color-foreground)] text-white text-sm font-semibold">
                  ログイン
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* 共有などで表示されるユーザー名 */}
        {isAuthenticated && (
          <section>
            <h2 className="text-sm font-medium text-[var(--color-muted)] mb-3 px-1">プロフィール</h2>
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Icon name="person" size={20} className="text-[var(--color-muted)]" />
                <div className="flex-1">
                  <p className="font-medium text-[var(--color-foreground)]">ユーザー名</p>
                  <p className="text-xs text-[var(--color-muted)]">共有した単語帳に表示される名前です。</p>
                </div>
              </div>

              {isEditingUsername ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    maxLength={20}
                    placeholder="ユーザー名を入力"
                    className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-foreground)]/20"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={profileSaving || !usernameInput.trim()} onClick={async () => { const success = await setUsername(usernameInput); if (success) setIsEditingUsername(false); }}>
                      {profileSaving ? '保存中...' : '保存'}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={profileSaving} onClick={() => { setIsEditingUsername(false); setUsernameInput(username ?? ''); }}>
                      キャンセル
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setUsernameInput(username ?? ''); setIsEditingUsername(true); }}
                  disabled={profileLoading}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--color-surface-secondary)] w-full text-left"
                >
                  <Icon name="person" size={16} className="text-[var(--color-muted)]" />
                  <span className={`text-sm flex-1 ${username ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted)]'}`}>
                    {profileLoading ? '読み込み中...' : (username ?? 'ユーザー名を設定')}
                  </span>
                  <Icon name="edit" size={14} className="text-[var(--color-muted)]" />
                </button>
              )}
              {profileError && <p className="text-xs text-[var(--color-error)]">{profileError}</p>}
            </div>
          </section>
        )}

        {/* Account section - iOS style */}
        <section>
          <h2 className="text-sm font-medium text-[var(--color-muted)] mb-3 px-1">アカウント</h2>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-light)]">
              <div className="flex items-center gap-3">
                <Icon name="badge" size={20} className="text-[var(--color-muted)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">アカウント状態</p>
                  <p className="text-xs text-[var(--color-muted)]">{isAuthenticated ? '認証済み' : '未認証'}</p>
                </div>
              </div>
              <span className="text-sm text-[var(--color-foreground)]">{isPro ? 'Pro' : 'Free'}</span>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-light)]">
              <div className="flex items-center gap-3">
                <Icon name="cloud" size={20} className="text-[var(--color-muted)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">保存先</p>
                  <p className="text-xs text-[var(--color-muted)]">{isPro ? 'クラウド保存' : 'このデバイスのみ'}</p>
                </div>
              </div>
              <span className="text-sm text-[var(--color-foreground)]">{isPro ? 'Cloud' : 'Local'}</span>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3">
                <Icon name="workspace_premium" size={20} className="text-[var(--color-muted)]" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--color-foreground)]">Merken Pro</p>
                    {isPro && <span className="chip chip-pro text-[10px] py-0.5 px-2"><Icon name="add" size={10} /> Pro</span>}
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">¥{STRIPE_CONFIG.plans.pro.price.toLocaleString()}/月</p>
                </div>
              </div>
              {isPro && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--color-surface-secondary)] text-[var(--color-muted)]">スキャン無制限</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--color-surface-secondary)] text-[var(--color-muted)]">単語数無制限</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--color-surface-secondary)] text-[var(--color-muted)]">クラウド同期</span>
                </div>
              )}
              {subscriptionDisplayDate && (
                <p className="text-xs text-[var(--color-muted)] mt-2">
                  有効期限: {new Date(subscriptionDisplayDate.isoDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              )}
              {!isPro && (
                <Link href="/subscription" className="mt-3 block w-full text-center py-2.5 rounded-xl bg-[var(--color-foreground)] text-white text-sm font-semibold">
                  ¥{STRIPE_CONFIG.plans.pro.price.toLocaleString()}/月で始める
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Support section - iOS style */}
        <section>
          <h2 className="text-sm font-medium text-[var(--color-muted)] mb-3 px-1">サポート</h2>
          <div className="card overflow-hidden">
            <Link href="/terms" className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-light)] active:bg-[var(--color-surface-secondary)]">
              <div className="flex items-center gap-3">
                <Icon name="description" size={20} className="text-[var(--color-muted)]" />
                <span className="text-sm text-[var(--color-foreground)]">利用規約</span>
              </div>
              <Icon name="chevron_right" size={20} className="text-[var(--color-muted)]" />
            </Link>
            <Link href="/privacy" className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-light)] active:bg-[var(--color-surface-secondary)]">
              <div className="flex items-center gap-3">
                <Icon name="shield" size={20} className="text-[var(--color-muted)]" />
                <span className="text-sm text-[var(--color-foreground)]">プライバシーポリシー</span>
              </div>
              <Icon name="chevron_right" size={20} className="text-[var(--color-muted)]" />
            </Link>
            <Link href="/contact" className="flex items-center justify-between px-5 py-4 active:bg-[var(--color-surface-secondary)]">
              <div className="flex items-center gap-3">
                <Icon name="mail" size={20} className="text-[var(--color-muted)]" />
                <span className="text-sm text-[var(--color-foreground)]">お問い合わせ</span>
              </div>
              <Icon name="chevron_right" size={20} className="text-[var(--color-muted)]" />
            </Link>
          </div>
        </section>

        {/* Sign out */}
        {isAuthenticated && (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 text-[var(--color-error)] font-medium"
          >
            <Icon name="logout" size={20} />
            ログアウト
          </button>
        )}

        <p className="text-center text-xs text-[var(--color-muted)] pb-4">v1.0.0</p>
      </main>
    </div>
    </>
  );
}
