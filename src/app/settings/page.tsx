'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, Loader2, AlertTriangle, ChevronRight, Sparkles, Mail, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { KOMOJU_CONFIG } from '@/lib/komoju/config';

type Theme = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscription, isPro, signOut, loading: authLoading } = useAuth();
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings state
  const [theme, setTheme] = useState<Theme>('system');
  const [showStats, setShowStats] = useState(true);

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('scanvocab_theme') as Theme;
      const savedShowStats = localStorage.getItem('scanvocab_show_stats');

      if (savedTheme) setTheme(savedTheme);
      if (savedShowStats !== null) setShowStats(savedShowStats === 'true');
    }
  }, []);

  // Save settings
  const updateTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('scanvocab_theme', newTheme);
  };

  const updateShowStats = (show: boolean) => {
    setShowStats(show);
    localStorage.setItem('scanvocab_show_stats', String(show));
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/settings');
    }
  }, [authLoading, user, router]);

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

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  const themeLabels: Record<Theme, string> = {
    light: 'ライト',
    dark: 'ダーク',
    system: 'システム',
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">設定</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Account */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
              <Mail className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
              <p className="text-xs text-gray-500">
                {isPro ? 'Pro' : 'Free'}
              </p>
            </div>
          </div>
        </div>

        {/* Display Settings */}
        <section>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
            表示
          </h2>
          <div className="bg-gray-50 rounded-xl overflow-hidden">
            {/* Theme */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-900">テーマ</span>
              <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-0.5">
                {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateTheme(t)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      theme === t
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {themeLabels[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-gray-200 mx-4" />

            {/* Show Stats */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-900">統計バーを表示</span>
              <button
                onClick={() => updateShowStats(!showStats)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  showStats ? 'bg-gray-900' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    showStats ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Plan */}
        <section>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
            プラン
          </h2>
          <div className="bg-gray-50 rounded-xl p-4">
            {isPro ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-gray-900">Pro</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    ¥{KOMOJU_CONFIG.plans.pro.price.toLocaleString()}/月
                  </span>
                </div>

                {subscription?.currentPeriodEnd && (
                  <p className="text-xs text-gray-400">
                    次回更新: {new Date(subscription.currentPeriodEnd).toLocaleDateString('ja-JP')}
                  </p>
                )}

                {!showCancelConfirm ? (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    解約する
                  </button>
                ) : (
                  <div className="bg-red-50 rounded-lg p-3 space-y-3">
                    <div className="flex items-start gap-2 text-red-600">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p className="text-xs">
                        解約すると、スキャン無制限やクラウド同期が使えなくなります。
                      </p>
                    </div>
                    {error && (
                      <p className="text-xs text-red-600">{error}</p>
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
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">Free</span>
                  <span className="text-xs text-gray-400">{KOMOJU_CONFIG.freePlan.dailyScanLimit}スキャン/日</span>
                </div>
                <Link href="/subscription">
                  <Button size="sm" className="w-full">
                    Proにアップグレード
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Support */}
        <section>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
            サポート
          </h2>
          <div className="bg-gray-50 rounded-xl overflow-hidden">
            <a
              href="mailto:support@scanvocab.app"
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm text-gray-900">お問い合わせ</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </a>

            <div className="h-px bg-gray-200 mx-4" />

            <a
              href="/terms"
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm text-gray-900">利用規約</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </a>

            <div className="h-px bg-gray-200 mx-4" />

            <a
              href="/privacy"
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm text-gray-900">プライバシーポリシー</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </a>
          </div>
        </section>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 py-3 text-gray-500 hover:text-gray-700 transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" />
          ログアウト
        </button>

        {/* Version */}
        <p className="text-center text-xs text-gray-300">
          v1.0.0
        </p>
      </main>
    </div>
  );
}
