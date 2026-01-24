'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, Loader2, AlertTriangle, ChevronRight, Sparkles, Mail, ExternalLink, User, Check, Cloud, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  // Settings state
  const [showStats, setShowStats] = useState(true);

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedShowStats = localStorage.getItem('scanvocab_show_stats');
      if (savedShowStats !== null) setShowStats(savedShowStats === 'true');
    }
  }, []);

  // Save settings
  const updateTheme = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  const updateShowStats = (show: boolean) => {
    setShowStats(show);
    localStorage.setItem('scanvocab_show_stats', String(show));
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
        {/* Account - show login prompt or user info */}
        {authLoading ? (
          <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : isAuthenticated ? (
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
        ) : (
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-gray-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">ゲスト</p>
                <p className="text-xs text-gray-500">ログインでクラウド同期</p>
              </div>
              <Link href="/login">
                <Button size="sm" variant="secondary">
                  ログイン
                </Button>
              </Link>
            </div>
          </div>
        )}

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

        {/* Plan Section */}
        <section>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
            プラン
          </h2>
          <div className="bg-gray-50 rounded-xl p-4">
            {isPro ? (
              // Pro User Plan View
              <div className="space-y-4">
                {/* Plan Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-gray-900">Pro</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    ¥{KOMOJU_CONFIG.plans.pro.price.toLocaleString()}/月
                  </span>
                </div>

                {/* Usage Stats for Pro */}
                <div className="space-y-2">
                  {/* Scan */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600">スキャン</span>
                    <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                      無制限 <Check className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  <div className="h-px bg-gray-200" />

                  {/* Word Count */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600">単語数</span>
                    <span className="text-sm text-gray-900">
                      {wordCountLoading ? '...' : `${wordCount}語`}
                      <span className="text-gray-400 ml-1">（無制限）</span>
                    </span>
                  </div>

                  <div className="h-px bg-gray-200" />

                  {/* Cloud Sync */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600">保存</span>
                    <span className="text-sm text-blue-600 font-medium flex items-center gap-1">
                      <Cloud className="w-3.5 h-3.5" />
                      クラウド同期中
                    </span>
                  </div>
                </div>

                {/* Next Billing */}
                {subscription?.currentPeriodEnd && (
                  <p className="text-xs text-gray-400">
                    次回更新: {new Date(subscription.currentPeriodEnd).toLocaleDateString('ja-JP')}
                  </p>
                )}

                {/* Cancel Section */}
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
              // Free User Plan View
              <div className="space-y-4">
                {/* Plan Header */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">Free</span>
                </div>

                {/* Usage Stats for Free */}
                <div className="space-y-2">
                  {/* Scan */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600">スキャン</span>
                    <span className="text-sm text-gray-900">{FREE_DAILY_SCAN_LIMIT}回/日</span>
                  </div>

                  <div className="h-px bg-gray-200" />

                  {/* Word Count */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600">単語数</span>
                    <span className="text-sm text-gray-900">
                      {wordCountLoading ? '...' : wordCount}/{FREE_WORD_LIMIT}
                    </span>
                  </div>

                  <div className="h-px bg-gray-200" />

                  {/* Storage */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600">保存</span>
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5" />
                      このデバイスのみ
                    </span>
                  </div>
                </div>

                {/* Pro Upgrade Card */}
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-gray-900">Proにアップグレード</span>
                  </div>
                  <ul className="text-xs text-gray-600 space-y-1 ml-6">
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-green-500" />
                      スキャン無制限
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-green-500" />
                      単語数無制限
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-green-500" />
                      クラウド同期
                    </li>
                  </ul>
                  <Link href="/subscription">
                    <Button size="sm" className="w-full mt-2">
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

        {/* Sign out - only show if authenticated */}
        {isAuthenticated && (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 text-gray-500 hover:text-gray-700 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            ログアウト
          </button>
        )}

        {/* Version */}
        <p className="text-center text-xs text-gray-300">
          v1.0.0
        </p>
      </main>
    </div>
  );
}
