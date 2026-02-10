'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, Button, AppShell } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/components/theme-provider';
import { useWordCount } from '@/hooks/use-word-count';
import { KOMOJU_CONFIG } from '@/lib/komoju/config';
import { FREE_DAILY_SCAN_LIMIT, FREE_WORD_LIMIT } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscription, isPro, signOut, refresh, loading: authLoading, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const { count: wordCount, loading: wordCountLoading } = useWordCount();
  const hasCancellationScheduled = !!subscription?.cancelAtPeriodEnd;
  const isBillingPro = isPro && subscription?.proSource === 'billing';
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);

  // Save settings
  const updateTheme = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  const handleSignOut = async () => {
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
    <AppShell>
    <div className="min-h-screen pb-24 lg:pb-6">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">設定</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-4 space-y-6">
        {/* Account - show login prompt or user info */}
        {authLoading ? (
          <div className="card p-4 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isAuthenticated ? (
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center">
                <Icon name="mail" size={24} className="text-[var(--color-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--color-foreground)] truncate">{user?.email}</p>
                <div className="flex items-center gap-1">
                  {isPro ? (
                    <span className="chip chip-pro">
                      <Icon name="auto_awesome" size={12} />
                      Pro
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--color-muted)]">Free</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[var(--color-surface)] rounded-full flex items-center justify-center">
                <Icon name="person" size={24} className="text-[var(--color-muted)]" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-[var(--color-foreground)]">ゲスト</p>
                <p className="text-sm text-[var(--color-muted)]">ログインでクラウド同期</p>
              </div>
              <Link href="/login">
                <Button size="sm">
                  ログイン
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Display Settings */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3 px-1">
            表示
          </h2>
          <div className="card overflow-hidden">
            {/* Theme */}
            <div className="flex items-center justify-between px-4 py-4">
              <span className="font-medium text-[var(--color-foreground)]">テーマ</span>
              <div className="flex items-center gap-1 bg-[var(--color-background)] rounded-full p-1 border border-[var(--color-border)]">
                {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateTheme(t)}
                    className={`px-3 py-1.5 text-sm rounded-full transition-all ${
                      theme === t
                        ? 'bg-[var(--color-primary)] text-white font-medium'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                    }`}
                  >
                    {themeLabels[t]}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* Plan Section */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3 px-1">
            プラン
          </h2>
          <div className="card p-4">
            {isPro ? (
              // Pro User Plan View
              <div className="space-y-4">
                {/* Plan Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="chip chip-pro">
                      <Icon name="auto_awesome" size={12} />
                      Pro
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-[var(--color-foreground)]">
                    ¥{KOMOJU_CONFIG.plans.pro.price.toLocaleString()}/月
                  </span>
                </div>

                {/* Usage Stats for Pro */}
                <div className="space-y-3">
                  {/* Scan */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[var(--color-muted)]">スキャン</span>
                    <span className="font-medium text-[var(--color-success)] flex items-center gap-1">
                      無制限 <Icon name="check" size={16} />
                    </span>
                  </div>

                  <div className="h-px bg-[var(--color-border)]" />

                  {/* Word Count */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[var(--color-muted)]">単語数</span>
                    <span className="font-medium text-[var(--color-foreground)]">
                      {wordCountLoading ? '...' : `${wordCount}語`}
                      <span className="text-[var(--color-muted)] ml-1">（無制限）</span>
                    </span>
                  </div>

                  <div className="h-px bg-[var(--color-border)]" />

                  {/* Cloud Sync */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[var(--color-muted)]">保存</span>
                    <span className="font-medium text-[var(--color-primary)] flex items-center gap-1">
                      <Icon name="cloud" size={16} />
                      クラウド同期中
                    </span>
                  </div>
                </div>

                {/* Next Billing */}
                {subscription?.currentPeriodEnd && (
                  <p className="text-sm text-[var(--color-muted)]">
                    {hasCancellationScheduled ? '解約予定日' : '次回更新'}: {new Date(subscription.currentPeriodEnd).toLocaleDateString('ja-JP')}
                  </p>
                )}

                {/* Cancel Section */}
                {hasCancellationScheduled ? (
                  <div className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)]">
                    <p className="text-sm text-[var(--color-muted)]">
                      解約予約済みです。期間終了日までPro機能を利用できます。
                    </p>
                  </div>
                ) : isBillingPro ? (
                  <div className="space-y-3">
                    <div className="bg-[var(--color-warning)]/10 rounded-2xl p-4 border border-[var(--color-warning)]/30">
                      <p className="text-sm text-[var(--color-foreground)]">
                        解約後も現在の契約期間が終了するまではPro機能を利用できます。
                      </p>
                    </div>

                    {cancelError && (
                      <div className="bg-[var(--color-error-light)] rounded-2xl p-3 border border-[var(--color-error)]/30">
                        <p className="text-sm text-[var(--color-error)]">{cancelError}</p>
                      </div>
                    )}

                    {cancelSuccess && (
                      <div className="bg-[var(--color-success-light)] rounded-2xl p-3 border border-[var(--color-success)]/30">
                        <p className="text-sm text-[var(--color-success)]">{cancelSuccess}</p>
                      </div>
                    )}

                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={handleCancelAtPeriodEnd}
                      disabled={isCancelling}
                    >
                      {isCancelling ? '処理中...' : '期間末で解約する'}
                    </Button>
                  </div>
                ) : (
                  <div className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)]">
                    <p className="text-sm text-[var(--color-muted)]">
                      現在のProは課金サブスクリプションではないため、解約操作は不要です。
                    </p>
                  </div>
                )}
              </div>
            ) : (
              // Free User Plan View
              <div className="space-y-4">
                {/* Plan Header */}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--color-foreground)]">Free</span>
                </div>

                {/* Usage Stats for Free */}
                <div className="space-y-3">
                  {/* Scan */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[var(--color-muted)]">スキャン</span>
                    <span className="font-medium text-[var(--color-foreground)]">{FREE_DAILY_SCAN_LIMIT}回/日</span>
                  </div>

                  <div className="h-px bg-[var(--color-border)]" />

                  {/* Word Count */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[var(--color-muted)]">単語数</span>
                    <span className="font-medium text-[var(--color-foreground)]">
                      {wordCountLoading ? '...' : wordCount}/{FREE_WORD_LIMIT}
                    </span>
                  </div>

                  <div className="h-px bg-[var(--color-border)]" />

                  {/* Storage */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[var(--color-muted)]">保存</span>
                    <span className="text-[var(--color-muted)] flex items-center gap-1">
                      <Icon name="smartphone" size={16} />
                      このデバイスのみ
                    </span>
                  </div>
                </div>

                {/* Pro Upgrade Card */}
                <div className="bg-gradient-to-r from-[var(--color-primary-light)] to-[var(--color-primary)]/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="chip chip-pro">
                      <Icon name="auto_awesome" size={12} />
                      Pro
                    </span>
                    <span className="font-bold text-[var(--color-foreground)]">にアップグレード</span>
                  </div>
                  <ul className="text-sm text-[var(--color-foreground)] space-y-2">
                    <li className="flex items-center gap-2">
                      <Icon name="check" size={16} className="text-[var(--color-success)]" />
                      スキャン無制限
                    </li>
                    <li className="flex items-center gap-2">
                      <Icon name="check" size={16} className="text-[var(--color-success)]" />
                      単語数無制限
                    </li>
                    <li className="flex items-center gap-2">
                      <Icon name="check" size={16} className="text-[var(--color-success)]" />
                      クラウド同期
                    </li>
                  </ul>
                  <Link href="/subscription">
                    <Button className="w-full mt-2">
                      ¥{KOMOJU_CONFIG.plans.pro.price.toLocaleString()}/月で始める
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Support */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3 px-1">
            サポート
          </h2>
          <div className="card overflow-hidden">
            <Link
              href="/contact"
              className="flex items-center justify-between px-4 py-4 hover:bg-[var(--color-primary-light)] transition-colors"
            >
              <span className="font-medium text-[var(--color-foreground)]">お問い合わせ</span>
              <Icon name="chevron_right" size={20} className="text-[var(--color-muted)]" />
            </Link>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            <Link
              href="/terms"
              className="flex items-center justify-between px-4 py-4 hover:bg-[var(--color-primary-light)] transition-colors"
            >
              <span className="font-medium text-[var(--color-foreground)]">利用規約</span>
              <Icon name="chevron_right" size={20} className="text-[var(--color-muted)]" />
            </Link>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            <Link
              href="/privacy"
              className="flex items-center justify-between px-4 py-4 hover:bg-[var(--color-primary-light)] transition-colors"
            >
              <span className="font-medium text-[var(--color-foreground)]">プライバシーポリシー</span>
              <Icon name="chevron_right" size={20} className="text-[var(--color-muted)]" />
            </Link>
          </div>
        </section>

        {/* Sign out - only show if authenticated */}
        {isAuthenticated && (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 text-[var(--color-muted)] hover:text-[var(--color-error)] transition-colors font-medium"
          >
            <Icon name="logout" size={20} />
            ログアウト
          </button>
        )}

        {/* Version */}
        <p className="text-center text-sm text-[var(--color-muted)]">
          v1.0.0
        </p>
      </main>
    </div>
    </AppShell>
  );
}
