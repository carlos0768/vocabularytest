'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, Loader2, AlertTriangle, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { KOMOJU_CONFIG } from '@/lib/komoju/config';

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscription, isPro, signOut, loading: authLoading } = useAuth();
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Show loading while checking auth or redirecting
  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-semibold">設定</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Account section */}
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-900">アカウント</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{user?.email}</p>
                <p className="text-sm text-gray-500">
                  {isPro ? 'Proプラン' : '無料プラン'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Subscription section */}
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-900">プラン</h2>
          </div>
          <div className="p-4">
            {isPro ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-yellow-600">
                  <Sparkles className="w-5 h-5" />
                  <span className="font-medium">Proプラン利用中</span>
                </div>
                <div className="text-sm text-gray-600">
                  <p>月額 ¥{KOMOJU_CONFIG.plans.pro.price.toLocaleString()}</p>
                  {subscription?.currentPeriodEnd && (
                    <p className="mt-1">
                      次回更新日: {new Date(subscription.currentPeriodEnd).toLocaleDateString('ja-JP')}
                    </p>
                  )}
                </div>

                {!showCancelConfirm ? (
                  <Button
                    variant="ghost"
                    onClick={() => setShowCancelConfirm(true)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    プランを解約
                  </Button>
                ) : (
                  <div className="bg-red-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-2 text-red-700">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">解約しますか？</p>
                        <p className="mt-1">解約すると、スキャン無制限やクラウド同期機能が使えなくなります。</p>
                      </div>
                    </div>
                    {error && (
                      <p className="text-sm text-red-600">{error}</p>
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
                            処理中...
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
              <div className="space-y-4">
                <p className="text-gray-600">無料プランをご利用中です</p>
                <Link href="/subscription">
                  <Button className="w-full">
                    <Sparkles className="w-5 h-5 mr-2" />
                    Proプランにアップグレード
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Sign out */}
        <Button
          variant="secondary"
          onClick={handleSignOut}
          className="w-full"
        >
          <LogOut className="w-5 h-5 mr-2" />
          ログアウト
        </Button>
      </main>
    </div>
  );
}
