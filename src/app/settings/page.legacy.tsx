'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, Button } from '@/components/ui';
import { SolidHeader, SolidPage, SolidPanel, SolidRow, SolidSectionTitle } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/components/theme-provider';
import { useWordCount } from '@/hooks/use-word-count';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { STRIPE_CONFIG } from '@/lib/stripe/config';
import { getSubscriptionDisplayDate } from '@/lib/subscription/display';

type Theme = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscription, isPro, signOut, loading: authLoading, isAuthenticated } = useAuth();
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
  const subscriptionDisplayDate = getSubscriptionDisplayDate(subscription);

  // Save settings
  const updateTheme = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  const handleSignOut = async () => {
    if (!window.confirm('ログアウトしますか？')) return;
    await signOut();
    router.push('/');
  };

  const themeLabels: Record<Theme, string> = {
    light: 'ライト',
    dark: 'ダーク',
    system: 'システム',
  };

  return (
    <>
    <SolidPage maxWidth="max-w-lg lg:max-w-2xl">
      <SolidHeader
        eyebrow="ACCOUNT"
        title="設定"
        description="アカウント、同期、Proプラン、表示設定を管理します。"
      />
        {/* ログイン中のメール・プラン（「プロフィール」とは別枠） */}
        {authLoading ? (
          <section>
            <SolidSectionTitle icon="mail" title="ログイン情報" />
            <SolidPanel className="flex items-center justify-center p-5">
              <div className="w-6 h-6 border-2 border-[var(--color-foreground)] border-t-transparent rounded-full animate-spin" />
            </SolidPanel>
          </section>
        ) : isAuthenticated ? (
          <section>
            <SolidSectionTitle icon="mail" title="ログイン情報" />
            <SolidPanel className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
                  <Icon name="mail" size={28} className="text-[var(--solid-ink)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-muted)]">{isPro ? 'Pro' : 'Free'}</span>
                  </div>
                  <p className="font-bold text-[var(--color-foreground)] truncate">{user?.email}</p>
                  
                </div>
                {isPro && (
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="chip chip-pro text-xs">
                      Pro
                    </span>
                  </div>
                )}
              </div>
            </SolidPanel>
          </section>
        ) : (
          <section>
            <SolidSectionTitle icon="login" title="サインイン" />
            <SolidPanel className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[16px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
                  <Icon name="login" size={28} className="text-[var(--solid-ink)]" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-[var(--color-foreground)]">ゲスト</p>
                  <p className="text-sm text-[var(--color-muted)]">ログインでクラウド同期</p>
                </div>
                <Link href="/login" className="solid-link-primary px-5 py-2.5">
                  ログイン
                </Link>
              </div>
            </SolidPanel>
          </section>
        )}

        {/* 共有などで表示されるユーザー名 */}
        {isAuthenticated && (
          <section>
            <SolidSectionTitle icon="person" title="プロフィール" />
            <SolidPanel className="space-y-3 p-5">
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
                    className="solid-input w-full px-3 py-2.5"
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
                  className="flex w-full items-center gap-2 rounded-[12px] border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-left"
                >
                  <Icon name="person" size={16} className="text-[var(--color-muted)]" />
                  <span className={`text-sm flex-1 ${username ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted)]'}`}>
                    {profileLoading ? '読み込み中...' : (username ?? 'ユーザー名を設定')}
                  </span>
                  <Icon name="edit" size={14} className="text-[var(--color-muted)]" />
                </button>
              )}
              {profileError && <p className="text-xs text-[var(--color-error)]">{profileError}</p>}
            </SolidPanel>
          </section>
        )}

        <section>
          <SolidSectionTitle icon="tune" title="学習環境" />
          <SolidPanel className="overflow-hidden p-0">
            <div className="border-b border-[var(--color-border-light)] px-5 py-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
                  <Icon name="palette" size={19} className="text-[var(--solid-ink)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--solid-ink)]">表示テーマ</p>
                  <p className="text-xs text-[var(--color-muted)]">画面の明るさを選択</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'dark', 'system'] as Theme[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => updateTheme(item)}
                    className={`rounded-[10px] border-[1.5px] px-3 py-2 text-xs font-black ${
                      theme === item
                        ? 'border-[var(--solid-ink)] bg-[var(--color-foreground)] text-white'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
                    }`}
                  >
                    {themeLabels[item]}
                  </button>
                ))}
              </div>
            </div>
            <SolidRow icon="psychology" title="AI補助" detail={userPreferencesError ?? '翻訳や例文生成の補助を使います'}>
              <button
                type="button"
                onClick={() => setAiEnabled(!(aiEnabled !== false))}
                disabled={userPreferencesLoading || userPreferencesSaving}
                className={`h-7 w-12 rounded-full border-[1.5px] border-[var(--solid-ink)] p-0.5 transition-colors ${
                  aiEnabled !== false ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
                }`}
                aria-pressed={aiEnabled !== false}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                    aiEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </SolidRow>
            <SolidRow icon="data_usage" title="保存済み単語" detail={wordCountLoading ? '集計中...' : `${wordCount.toLocaleString()}語`}>
              <span className="font-mono text-xs font-bold text-[var(--color-muted)]">READ ONLY</span>
            </SolidRow>
          </SolidPanel>
        </section>

        {/* Account section - iOS style */}
        <section>
          <SolidSectionTitle icon="badge" title="アカウント" />
          <SolidPanel className="overflow-hidden p-0">
            <SolidRow icon="badge" title="アカウント状態" detail={!isAuthenticated ? '未認証' : undefined}>
              <span className="text-sm font-bold text-[var(--solid-ink)]">{isPro ? 'Pro' : 'Free'}</span>
            </SolidRow>
            <SolidRow icon="cloud" title="保存先" detail={!isPro ? 'このデバイスのみ' : undefined}>
              <span className="text-sm font-bold text-[var(--solid-ink)]">{isPro ? 'Cloud' : 'Local'}</span>
            </SolidRow>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-accent-subtle)]">
                  <Icon name="workspace_premium" size={20} className="text-[var(--color-accent)]" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--color-foreground)]">Merken Pro</p>
                    {isPro && <span className="chip chip-pro text-[10px] py-0.5 px-2">Pro</span>}
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">¥{STRIPE_CONFIG.plans.pro.price.toLocaleString()}/月</p>
                </div>
              </div>
              {subscriptionDisplayDate && (
                <p className="text-xs text-[var(--color-muted)] mt-2">
                  有効期限: {new Date(subscriptionDisplayDate.isoDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              )}
              {!isPro && (
                <Link href="/subscription" className="solid-link-primary mt-3 flex w-full">
                  ¥{STRIPE_CONFIG.plans.pro.price.toLocaleString()}/月で始める
                </Link>
              )}
            </div>
          </SolidPanel>
        </section>

        {/* Support section - iOS style */}
        <section>
          <SolidSectionTitle icon="help" title="サポート" />
          <SolidPanel className="overflow-hidden p-0">
            <SolidRow href="/terms" icon="description" title="利用規約" />
            <SolidRow href="/privacy" icon="shield" title="プライバシーポリシー" />
            <SolidRow href="/tokusho" icon="storefront" title="特定商取引法に基づく表記" />
            <SolidRow href="/contact" icon="mail" title="お問い合わせ" />
          </SolidPanel>
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
      </SolidPage>
    </>
  );
}
