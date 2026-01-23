'use client';

import { useState } from 'react';
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

  if (authLoading) {
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
            <h1 className="text-lg font-semibold">プラン選択</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Current plan */}
        {isPro && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-green-700">
              <Check className="w-5 h-5" />
              <span className="font-medium">現在Proプランをご利用中です</span>
            </div>
          </div>
        )}

        {/* Free Plan */}
        <div className={`bg-white rounded-2xl border-2 p-6 mb-4 ${!isPro ? 'border-blue-500' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">無料プラン</h2>
            <span className="text-2xl font-bold">¥0</span>
          </div>
          <ul className="space-y-2 text-gray-600 mb-4">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-gray-400" />
              1日3回までスキャン
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
            <div className="text-center text-sm text-gray-500">現在のプラン</div>
          )}
        </div>

        {/* Pro Plan */}
        <div className={`bg-white rounded-2xl border-2 p-6 ${isPro ? 'border-blue-500' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            <h2 className="text-xl font-bold">{plan.name}</h2>
          </div>
          <div className="mb-4">
            <span className="text-3xl font-bold">¥{plan.price.toLocaleString()}</span>
            <span className="text-gray-500">/月</span>
          </div>
          <ul className="space-y-3 mb-6">
            {plan.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                <span>{feature}</span>
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
        <p className="text-center text-sm text-gray-500 mt-6">
          PayPay・クレジットカードでお支払いいただけます
        </p>
      </main>
    </div>
  );
}
