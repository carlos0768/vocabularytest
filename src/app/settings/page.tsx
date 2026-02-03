'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Loader2, AlertTriangle, ChevronRight, Sparkles, Mail, User, Check, Cloud, Smartphone } from 'lucide-react';
import { Button, BottomNav } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/components/theme-provider';
import { useWordCount } from '@/hooks/use-word-count';
import { KOMOJU_CONFIG } from '@/lib/komoju/config';
import { FREE_DAILY_SCAN_LIMIT, FREE_WORD_LIMIT } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscription, isPro, signOut, loading: authLoading, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const { count: wordCount, loading: wordCountLoading } = useWordCount();
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save settings
  const updateTheme = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    setError(null);

    try {
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setShowCancelConfirm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '解約に失敗しました');
    } finally {
      setCancelling(false);
    }
  };

  const themeLabels: Record<Theme, string> = {
    light: 'ライト',
    dark: 'ダーク',
    system: 'システム',
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-24">
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
                <Mail className="w-6 h-6 text-[var(--color-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--color-foreground)] truncate">{user?.email}</p>
                <div className="flex items-center gap-1">
                  {isPro ? (
                    <span className="chip chip-pro">
                      <Sparkles className="w-3 h-3" />
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
                <User className="w-6 h-6 text-[var(--color-muted)]" />
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
                      <Sparkles className="w-3 h-3" />
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
                      無制限 <Check className="w-4 h-4" />
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
                      <Cloud className="w-4 h-4" />
                      クラウド同期中
                    </span>
                  </div>
                </div>

                {/* Next Billing */}
                {subscription?.currentPeriodEnd && (
                  <p className="text-sm text-[var(--color-muted)]">
                    次回更新: {new Date(subscription.currentPeriodEnd).toLocaleDateString('ja-JP')}
                  </p>
                )}

                {/* Cancel Section */}
                {!showCancelConfirm ? (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="text-sm text-[var(--color-muted)] hover:text-[var(--color-error)] transition-colors"
                  >
                    解約する
                  </button>
                ) : (
                  <div className="bg-[var(--color-error)]/10 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-2 text-[var(--color-error)]">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <p className="text-sm">
                        解約すると、スキャン無制限やクラウド同期が使えなくなります。
                      </p>
                    </div>
                    {error && (
                      <p className="text-sm text-[var(--color-error)]">{error}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowCancelConfirm(false)}
                        disabled={cancelling}
                      >
                        キャンセル
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleCancelSubscription}
                        disabled={cancelling}
                      >
                        {cancelling ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            処理中
                          </>
                        ) : (
                          '解約する'
                        )}
                      </Button>
                    </div>
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
                      <Smartphone className="w-4 h-4" />
                      このデバイスのみ
                    </span>
                  </div>
                </div>

                {/* Pro Upgrade Card */}
                <div className="bg-gradient-to-r from-[var(--color-peach-light)] to-[var(--color-primary)]/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="chip chip-pro">
                      <Sparkles className="w-3 h-3" />
                      Pro
                    </span>
                    <span className="font-bold text-[var(--color-foreground)]">にアップグレード</span>
                  </div>
                  <ul className="text-sm text-[var(--color-foreground)] space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[var(--color-success)]" />
                      スキャン無制限
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[var(--color-success)]" />
                      単語数無制限
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[var(--color-success)]" />
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
              className="flex items-center justify-between px-4 py-4 hover:bg-[var(--color-peach-light)] transition-colors"
            >
              <span className="font-medium text-[var(--color-foreground)]">お問い合わせ</span>
              <ChevronRight className="w-5 h-5 text-[var(--color-muted)]" />
            </Link>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            <Link
              href="/terms"
              className="flex items-center justify-between px-4 py-4 hover:bg-[var(--color-peach-light)] transition-colors"
            >
              <span className="font-medium text-[var(--color-foreground)]">利用規約</span>
              <ChevronRight className="w-5 h-5 text-[var(--color-muted)]" />
            </Link>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            <Link
              href="/privacy"
              className="flex items-center justify-between px-4 py-4 hover:bg-[var(--color-peach-light)] transition-colors"
            >
              <span className="font-medium text-[var(--color-foreground)]">プライバシーポリシー</span>
              <ChevronRight className="w-5 h-5 text-[var(--color-muted)]" />
            </Link>
          </div>
        </section>

        {/* Sign out - only show if authenticated */}
        {isAuthenticated && (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 text-[var(--color-muted)] hover:text-[var(--color-error)] transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            ログアウト
          </button>
        )}

        {/* Version */}
        <p className="text-center text-sm text-[var(--color-muted)]">
          v1.0.0
        </p>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
