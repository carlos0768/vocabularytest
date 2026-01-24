'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { KOMOJU_CONFIG } from '@/lib/komoju/config';

export default function SubscriptionPage() {
  const router = useRouter();
  const { user, subscription, loading: authLoading, isPro } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = KOMOJU_CONFIG.plans.pro;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/subscription');
    }
  }, [authLoading, user, router]);

  const handleSubscribe = async () => {
    if (!user) {
      router.push('/login?redirect=/subscription');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/subscription/create', {
        method: 'POST',
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      // Redirect to KOMOJU payment page
      window.location.href = data.paymentUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : '決済の開始に失敗しました');
      setProcessing(false);
    }
  };

  // Show loading while checking auth or redirecting
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

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
            <h1 className="text-lg font-semibold text-gray-900">プラン選択</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Current plan */}
        {isPro && (
          <div className="bg-emerald-50 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-emerald-700">
              <Check className="w-5 h-5" />
              <span className="font-medium text-sm">現在Proプランをご利用中です</span>
            </div>
          </div>
        )}

        {/* Free Plan */}
        <div className={`bg-gray-50 rounded-xl p-5 mb-3 ${!isPro ? 'ring-2 ring-blue-500' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">無料プラン</h2>
            <span className="text-xl font-bold text-gray-900">¥0</span>
          </div>
          <ul className="space-y-2 text-sm text-gray-600 mb-3">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-gray-400" />
              1日{KOMOJU_CONFIG.freePlan.dailyScanLimit}回までスキャン
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-gray-400" />
              ローカル保存のみ
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-gray-400" />
              単一デバイス
            </li>
          </ul>
          {!isPro && (
            <div className="text-center text-xs text-gray-400">現在のプラン</div>
          )}
        </div>

        {/* Pro Plan */}
        <div className={`bg-gray-50 rounded-xl p-5 ${isPro ? 'ring-2 ring-blue-500' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900">{plan.name}</h2>
          </div>
          <div className="mb-4">
            <span className="text-2xl font-bold text-gray-900">¥{plan.price.toLocaleString()}</span>
            <span className="text-gray-500 text-sm">/月</span>
          </div>
          <ul className="space-y-2 mb-5">
            {plan.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-500" />
                <span className="text-gray-700">{feature}</span>
              </li>
            ))}
          </ul>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {isPro ? (
            <Link href="/settings">
              <Button variant="secondary" className="w-full">
                プラン設定を管理
              </Button>
            </Link>
          ) : (
            <Button
              onClick={handleSubscribe}
              disabled={processing}
              className="w-full"
              size="lg"
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  処理中...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Proプランに登録
                </>
              )}
            </Button>
          )}
        </div>

        {/* Payment methods note */}
        <p className="text-center text-xs text-gray-400 mt-6">
          クレジットカードでお支払いいただけます
        </p>
      </main>
    </div>
  );
}
