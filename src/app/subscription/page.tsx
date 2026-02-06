'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { KOMOJU_CONFIG } from '@/lib/komoju/config';

export default function SubscriptionPage() {
  const router = useRouter();
  const { user, loading: authLoading, isPro } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = KOMOJU_CONFIG.plans.pro;

  const handleSubscribe = async () => {
    // Redirect to login if not authenticated
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

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 border-b border-[var(--color-border)]">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 -ml-1.5 hover:bg-[var(--color-primary-light)] rounded-md transition-colors"
            >
              <Icon name="arrow_back" size={20} className="text-[var(--color-muted)]" />
            </Link>
            <h1 className="text-lg font-semibold text-[var(--color-foreground)]">プラン選択</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Current plan */}
        {isPro && (
          <div className="bg-[var(--color-success-light)] rounded-[var(--radius-lg)] p-4 mb-6 border border-[var(--color-border)]">
            <div className="flex items-center gap-2 text-[var(--color-success)]">
              <Icon name="check" size={20} />
              <span className="font-medium text-sm">現在Proプランをご利用中です</span>
            </div>
          </div>
        )}

        {/* Free Plan */}
        <div className={`card p-5 mb-3 ${!isPro ? 'ring-2 ring-[var(--color-primary)]' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-[var(--color-foreground)]">無料プラン</h2>
            <span className="text-xl font-bold text-[var(--color-foreground)]">¥0</span>
          </div>
          <ul className="space-y-2 text-sm text-[var(--color-muted)] mb-3">
            <li className="flex items-center gap-2">
              <Icon name="check" size={16} className="text-[var(--color-muted)]" />
              1日{KOMOJU_CONFIG.freePlan.dailyScanLimit}回までスキャン
            </li>
            <li className="flex items-center gap-2">
              <Icon name="check" size={16} className="text-[var(--color-muted)]" />
              ローカル保存のみ
            </li>
            <li className="flex items-center gap-2">
              <Icon name="check" size={16} className="text-[var(--color-muted)]" />
              単一デバイス
            </li>
          </ul>
          {!isPro && (
            <div className="text-center text-xs text-[var(--color-muted)]">現在のプラン</div>
          )}
        </div>

        {/* Pro Plan */}
        <div className={`card p-5 ${isPro ? 'ring-2 ring-[var(--color-primary)]' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <Icon name="auto_awesome" size={20} className="text-[var(--color-primary)]" />
            <h2 className="text-lg font-semibold text-[var(--color-foreground)]">{plan.name}</h2>
          </div>
          <div className="mb-4">
            <span className="text-2xl font-bold text-[var(--color-foreground)]">¥{plan.price.toLocaleString()}</span>
            <span className="text-[var(--color-muted)] text-sm">/月</span>
          </div>
          <ul className="space-y-2 mb-5">
            {plan.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <Icon name="check" size={16} className="text-[var(--color-success)]" />
                <span className="text-[var(--color-foreground)]">{feature}</span>
              </li>
            ))}
          </ul>

          {error && (
            <div className="bg-[var(--color-error-light)] text-[var(--color-error)] px-4 py-2 rounded-[var(--radius-md)] mb-4 text-sm">
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
                  <Icon name="progress_activity" size={20} className="mr-2 animate-spin" />
                  処理中...
                </>
              ) : user ? (
                <>
                  <Icon name="auto_awesome" size={20} className="mr-2" />
                  Proプランに登録
                </>
              ) : (
                <>
                  <Icon name="auto_awesome" size={20} className="mr-2" />
                  ログインして登録
                </>
              )}
            </Button>
          )}
        </div>

        {/* Payment methods note */}
        <p className="text-center text-xs text-[var(--color-muted)] mt-6">
          クレジットカードでお支払いいただけます
        </p>
      </main>
    </div>
  );
}
