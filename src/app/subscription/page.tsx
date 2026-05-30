'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DesktopSubscriptionView } from '@/components/desktop/DesktopAccount';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { STRIPE_CONFIG } from '@/lib/stripe/config';

const FEATURES = [
  { label: '単語帳の作成数', free: '制限あり', pro: '無制限' },
  { label: '4択クイズ', free: 'OK', pro: 'OK' },
  { label: 'カメラスキャン', free: `1日${STRIPE_CONFIG.freePlan.dailyScanLimit}回`, pro: '無制限' },
  { label: 'クラウド同期', free: 'なし', pro: 'OK' },
  { label: '複数デバイス', free: 'なし', pro: 'OK' },
  { label: 'データ永続化', free: 'ローカル', pro: 'Cloud' },
];

export default function SubscriptionPage() {
  const router = useRouter();
  const { user, loading: authLoading, isPro } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = STRIPE_CONFIG.plans.pro;

  const handleSubscribe = async () => {
    if (!user) {
      router.push('/login?redirect=/subscription');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/subscription/create', { method: 'POST' });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '決済の開始に失敗しました');
      }

      window.location.href = data.checkoutUrl;
    } catch (subscribeError) {
      setError(subscribeError instanceof Error ? subscribeError.message : '決済の開始に失敗しました');
      setProcessing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
      </div>
    );
  }

  return (
    <>
      <DesktopSubscriptionView
        price={plan.price}
        processing={processing}
        error={error}
        isPro={isPro}
        userSignedIn={Boolean(user)}
        onSubscribe={() => void handleSubscribe()}
      />
      <div className="relative min-h-screen bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="flex items-center gap-2 px-[14px] pb-2 pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-8 w-8 items-center justify-center bg-transparent text-[var(--solid-ink)]"
          style={{ border: 'none', padding: 0 }}
        >
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="flex-1" />
        <span className="font-mono text-[10px] tracking-[0.06em] text-[var(--color-muted)]">
          SUBSCRIPTION
        </span>
      </div>

      <div className="px-[18px] pb-[18px]">
        <div className="relative">
          <div className="absolute inset-0 rounded-[18px] bg-[var(--solid-ink)]" style={{ transform: 'translate(3px, 3px)' }} />
          <div
            className="relative overflow-hidden rounded-[18px] border-[1.25px] border-[var(--solid-ink)] p-[22px_18px]"
            style={{ background: 'linear-gradient(135deg, oklch(0.96 0.04 130), oklch(0.92 0.06 96))' }}
          >
            <div className="absolute -right-5 -top-5 h-[110px] w-[110px] rounded-full bg-[var(--color-accent)] opacity-10" />
            <div className="inline-flex items-center gap-[5px] rounded bg-[var(--solid-ink)] px-2 py-[3px] font-mono text-[9px] font-bold tracking-[0.06em] text-white">
              <Icon name="star" size={11} filled />
              MERKEN PRO
            </div>
            <div className="relative mt-3 font-display text-[26px] leading-[1.2] tracking-[-0.02em] text-[var(--solid-ink)]">
              <span className="font-extrabold">全機能を解放</span>して、<br />本気で覚える。
            </div>
            <div className="relative mt-2 text-xs leading-[1.5] text-[var(--color-muted)]">
              無制限スキャン、クラウド同期、複数デバイス対応で単語帳を長く育てられます。
            </div>
          </div>
        </div>
      </div>

      <div className="px-[18px] pb-4">
        <div className="mb-2 pl-1 font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          PLAN
        </div>
        <div className="flex flex-col gap-2">
          <PlanCard
            active
            label="月額"
            price={`¥${plan.price.toLocaleString()}`}
            per="/月"
            sub="現在利用可能"
          />
          <PlanCard
            label="年額"
            price="準備中"
            per=""
            sub="年額プランのAPI接続後に有効化"
            disabled
          />
        </div>
      </div>

      <div className="px-[18px] pb-4">
        <div className="mb-2 pl-1 font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          COMPARE
        </div>
        <div
          className="overflow-hidden rounded-xl bg-white"
          style={{ border: '1.25px solid var(--solid-ink)', boxShadow: '2.5px 2.5px 0 var(--solid-ink)' }}
        >
          <div
            className="grid items-center px-3 py-2.5"
            style={{ gridTemplateColumns: '1.5fr 1fr 1fr', background: 'rgba(26,26,26,0.04)', borderBottom: '1.25px solid var(--solid-ink)' }}
          >
            <span className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">機能</span>
            <span className="text-center font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">FREE</span>
            <span className="text-center font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-accent)]">PRO</span>
          </div>
          {FEATURES.map((feature, i) => (
            <div
              key={feature.label}
              className="grid items-center px-3 py-[11px]"
              style={{ gridTemplateColumns: '1.5fr 1fr 1fr', borderBottom: i === FEATURES.length - 1 ? 'none' : '1px solid var(--color-border)' }}
            >
              <span className="text-xs text-[var(--solid-ink)]">{feature.label}</span>
              <span className="text-center font-mono text-[11px] text-[var(--color-muted)]">{feature.free}</span>
              <span className="text-center font-mono text-[11px] font-bold text-[var(--color-accent)]">{feature.pro}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-[18px] pb-4">
        {error && (
          <div className="mb-3 rounded-[10px] border border-[var(--color-error)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-error)]">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={processing || isPro}
          className="relative w-full disabled:opacity-65"
        >
          <span className="absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]" style={{ transform: 'translate(3px, 3px)' }} />
          <span className="relative flex items-center justify-center gap-2 rounded-[14px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] py-4 text-center font-[var(--font-body)] text-sm font-bold text-white">
            {processing && <Icon name="progress_activity" size={16} className="animate-spin" />}
            {isPro ? '現在Proプランです' : user ? 'Proプランに登録' : 'ログインして登録'}
          </span>
        </button>
        <div className="mt-2.5 text-center font-mono text-[9px] leading-[1.6] text-[var(--color-muted)]">
          購入により{' '}
          <Link href="/terms" className="underline">利用規約</Link>
          {' '}と{' '}
          <Link href="/privacy" className="underline">プライバシーポリシー</Link>
          {' '}に同意したものとします。
        </div>
      </div>

      <div className="h-[100px]" />
      </div>
    </>
  );
}

function PlanCard({
  active,
  label,
  price,
  per,
  sub,
  disabled,
}: {
  active?: boolean;
  label: string;
  price: string;
  per: string;
  sub: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative opacity-100" aria-disabled={disabled}>
      <div
        className="absolute inset-0 rounded-xl"
        style={{ transform: active ? 'translate(2.5px, 2.5px)' : 'translate(2px, 2px)', background: active ? 'var(--color-accent)' : 'var(--solid-ink)' }}
      />
      <div
        className="relative flex items-center gap-3 rounded-xl bg-white p-3.5"
        style={{ border: `${active ? 2 : 1.25}px solid ${active ? 'var(--color-accent)' : 'var(--solid-ink)'}` }}
      >
        <div className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full" style={{ border: `2px solid ${active ? 'var(--color-accent)' : 'var(--solid-ink)'}` }}>
          {active && <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />}
        </div>
        <div className="flex-1">
          <span className="font-display text-[15px] font-bold text-[var(--solid-ink)]">{label}</span>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--color-muted)]">{sub}</div>
        </div>
        <div className="text-right">
          <span className="font-display text-[18px] font-extrabold tabular-nums text-[var(--solid-ink)]">{price}</span>
          {per && <span className="ml-0.5 font-mono text-[11px] text-[var(--color-muted)]">{per}</span>}
        </div>
      </div>
    </div>
  );
}
