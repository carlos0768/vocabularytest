'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { SolidHeader, SolidPage, SolidPanel } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { STRIPE_CONFIG } from '@/lib/stripe/config';

export default function SubscriptionPage() {
  const router = useRouter();
  const { user, loading: authLoading, isPro } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = STRIPE_CONFIG.plans.pro;

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

      window.location.href = data.checkoutUrl;
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
    <SolidPage maxWidth="max-w-lg lg:max-w-2xl">
      <SolidHeader
        eyebrow="MERKEN PRO"
        title="プラン選択"
        description="クラウド同期、無制限に近い学習、共有機能で単語帳を長く育てられます。"
        backHref="/settings"
      />
        {/* Current plan */}
        {isPro && (
          <div className="mb-6 rounded-[var(--solid-radius-sm)] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-success-light)] p-4">
            <div className="flex items-center gap-2 text-[var(--color-success)]">
              <Icon name="check" size={20} />
              <span className="font-medium text-sm">現在Proプランをご利用中です</span>
            </div>
          </div>
        )}

        {/* Free Plan */}
        <SolidPanel className={`mb-4 p-5 ${!isPro ? 'ring-2 ring-[var(--solid-ink)]' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-black text-[var(--solid-ink)]">無料プラン</h2>
            <span className="text-xl font-black text-[var(--solid-ink)]">¥0</span>
          </div>
          <ul className="space-y-2 text-sm text-[var(--color-muted)] mb-3">
            <li className="flex items-center gap-2">
              <Icon name="check" size={16} className="text-[var(--color-muted)]" />
              1日{STRIPE_CONFIG.freePlan.dailyScanLimit}回までスキャン
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
        </SolidPanel>

        {/* Pro Plan */}
        <SolidPanel className={`p-5 ${isPro ? 'ring-2 ring-[var(--solid-ink)]' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-accent-subtle)]">
              <Icon name="auto_awesome" size={20} className="text-[var(--color-accent)]" />
            </span>
            <h2 className="text-lg font-black text-[var(--solid-ink)]">{plan.name}</h2>
          </div>
          <div className="mb-4">
            <span className="text-4xl font-black text-[var(--solid-ink)]">¥{plan.price.toLocaleString()}</span>
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
        </SolidPanel>

        {/* Payment methods note */}
        <p className="text-center text-xs text-[var(--color-muted)] mt-6">
          クレジットカードでお支払いいただけます
        </p>
        <p className="text-center text-xs text-[var(--color-muted)] mt-2">
          <Link href="/tokusho" className="underline underline-offset-2 hover:text-[var(--color-foreground)]">
            特定商取引法に基づく表記
          </Link>
          <span className="mx-2">/</span>
          <Link href="/terms" className="underline underline-offset-2 hover:text-[var(--color-foreground)]">
            利用規約
          </Link>
        </p>
      </SolidPage>
  );
}
