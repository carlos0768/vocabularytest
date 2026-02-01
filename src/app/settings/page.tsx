'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  LogOut, Loader2, AlertTriangle, Sparkles, Mail, User, Check, Cloud, Smartphone,
  Sun, Moon, Monitor, MessageCircle, FileText, Shield, CreditCard, HelpCircle
} from 'lucide-react';
import { Button, BottomNav } from '@/components/ui';
import { SettingsGroup, SettingsItem, SettingsToggle } from '@/components/settings';
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

  const themeIcons: Record<Theme, React.ReactNode> = {
    light: <Sun className="w-4 h-4" />,
    dark: <Moon className="w-4 h-4" />,
    system: <Monitor className="w-4 h-4" />,
  };

  const themeLabels: Record<Theme, string> = {
    light: 'ライト',
    dark: 'ダーク',
    system: 'システム',
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 backdrop-blur-sm z-40 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">設定</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-4 space-y-6">
        {/* Account Section */}
        <SettingsGroup title="アカウント">
          {authLoading ? (
            <div className="px-4 py-6 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isAuthenticated ? (
            <>
              <SettingsItem
                icon={<Mail className="w-4 h-4 text-[var(--color-primary)]" />}
                label={user?.email || 'メール未設定'}
                description={isPro ? 'Pro メンバー' : 'Free プラン'}
              >
                {isPro && (
                  <span className="chip chip-pro">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </SettingsItem>
              <SettingsItem
                icon={<LogOut className="w-4 h-4 text-[var(--color-muted)]" />}
                label="ログアウト"
                onClick={handleSignOut}
              />
            </>
          ) : (
            <SettingsItem
              icon={<User className="w-4 h-4 text-[var(--color-muted)]" />}
              label="ゲストモード"
              description="ログインでクラウド同期"
            >
              <Link href="/login">
                <Button size="sm">ログイン</Button>
              </Link>
            </SettingsItem>
          )}
        </SettingsGroup>

        {/* Display Settings */}
        <SettingsGroup title="表示設定">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-[var(--color-foreground)]">テーマ</span>
            </div>
            <div className="flex items-center gap-2 bg-[var(--color-background)] rounded-xl p-1 border border-[var(--color-border)]">
              {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-all ${
                    theme === t
                      ? 'bg-[var(--color-primary)] text-white font-medium'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                  }`}
                >
                  {themeIcons[t]}
                  {themeLabels[t]}
                </button>
              ))}
            </div>
          </div>
        </SettingsGroup>

        {/* Subscription Section */}
        <SettingsGroup title="プラン">
          {isPro ? (
            <>
              <SettingsItem
                icon={<CreditCard className="w-4 h-4 text-[var(--color-primary)]" />}
                label="Pro プラン"
                value={`¥${KOMOJU_CONFIG.plans.pro.price.toLocaleString()}/月`}
              />
              <SettingsItem
                icon={<Check className="w-4 h-4 text-[var(--color-success)]" />}
                label="スキャン"
                value="無制限"
              />
              <SettingsItem
                icon={<Cloud className="w-4 h-4 text-[var(--color-primary)]" />}
                label="保存"
                value="クラウド同期"
              />
              {subscription?.currentPeriodEnd && (
                <SettingsItem
                  label="次回更新日"
                  value={new Date(subscription.currentPeriodEnd).toLocaleDateString('ja-JP')}
                />
              )}
              {!showCancelConfirm ? (
                <SettingsItem
                  label="解約する"
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-[var(--color-muted)] hover:text-[var(--color-error)]"
                />
              ) : (
                <div className="px-4 py-4">
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
                </div>
              )}
            </>
          ) : (
            <>
              <SettingsItem
                icon={<User className="w-4 h-4 text-[var(--color-muted)]" />}
                label="Free プラン"
              />
              <SettingsItem
                label="スキャン"
                value={`${FREE_DAILY_SCAN_LIMIT}回/日`}
              />
              <SettingsItem
                label="単語数"
                value={wordCountLoading ? '...' : `${wordCount}/${FREE_WORD_LIMIT}`}
              />
              <SettingsItem
                icon={<Smartphone className="w-4 h-4 text-[var(--color-muted)]" />}
                label="保存"
                value="このデバイスのみ"
              />
              <div className="px-4 py-4">
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
            </>
          )}
        </SettingsGroup>

        {/* Support Section */}
        <SettingsGroup title="サポート">
          <SettingsItem
            icon={<MessageCircle className="w-4 h-4 text-[var(--color-primary)]" />}
            label="お問い合わせ"
            href="/contact"
            showChevron
          />
          <SettingsItem
            icon={<HelpCircle className="w-4 h-4 text-[var(--color-primary)]" />}
            label="よくある質問"
            href="/faq"
            showChevron
          />
          <SettingsItem
            icon={<FileText className="w-4 h-4 text-[var(--color-muted)]" />}
            label="利用規約"
            href="/terms"
            showChevron
          />
          <SettingsItem
            icon={<Shield className="w-4 h-4 text-[var(--color-muted)]" />}
            label="プライバシーポリシー"
            href="/privacy"
            showChevron
          />
        </SettingsGroup>

        {/* Version */}
        <p className="text-center text-sm text-[var(--color-muted)]">
          MERKEN v1.0.0
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
