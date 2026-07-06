'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, Modal, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useCoins } from '@/hooks/use-coins';
import { isBillingEnabled } from '@/lib/billing/feature';
import type { Subscription } from '@/types';

type ApiPayload = {
  success?: boolean;
  error?: string;
  message?: string;
  code?: string;
};

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getPlanHint(subscription: Subscription | null, isPro: boolean): string {
  if (!isPro) return 'FREE';
  if (subscription?.proSource === 'billing') return 'PRO';
  if (subscription?.proSource === 'appstore') return 'APP STORE';
  if (subscription?.proSource === 'test') return 'TEST';
  return 'PRO';
}

export default function PlanSettingsPage() {
  const router = useRouter();
  const { subscription, isPro, refresh } = useAuth();
  const { enabled: coinsEnabled, balance: coinBalance } = useCoins();
  const { showToast } = useToast();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isBillingPro = isPro && subscription?.proSource === 'billing';
  const isAppStorePro = isPro && subscription?.proSource === 'appstore';
  const billingEnabled = isBillingEnabled();
  const isCancelScheduled = Boolean(subscription?.cancelAtPeriodEnd);
  const periodEndLabel = formatDate(subscription?.currentPeriodEnd);
  const planHint = getPlanHint(subscription, isPro);

  const closeModal = () => {
    if (cancelLoading) return;
    setShowCancelModal(false);
    setCancelError(null);
  };

  const handleCancelSubscription = async () => {
    if (cancelLoading || !isBillingPro || isCancelScheduled) return;

    setCancelLoading(true);
    setCancelError(null);

    try {
      const response = await fetch('/api/subscription/cancel', { method: 'POST' });
      const payload = await response.json().catch(() => null) as ApiPayload | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '解約処理に失敗しました');
      }

      await refresh();
      setShowCancelModal(false);
      showToast({
        type: 'success',
        message: payload.message || '次回更新をキャンセルしました',
        duration: 5000,
      });
    } catch (error) {
      setCancelError(
        error instanceof Error ? error.message : '解約処理に失敗しました'
      );
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="px-[18px] pb-[14px] pt-1">
        <button
          type="button"
          onClick={() => router.push('/settings/account')}
          aria-label="アカウントへ戻る"
          className="mb-2 flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="chevron_left" size={20} />
        </button>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">PLAN</div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">プラン</div>
      </div>

      <SettingsGroup label="現在のプラン">
        <SettingsRow icon="credit_card" label="プラン" hint={planHint} />
        {periodEndLabel && isBillingPro && (
          <SettingsRow
            icon="event"
            label={isCancelScheduled ? '利用期限' : '次回更新日'}
            hint={periodEndLabel}
          />
        )}
      </SettingsGroup>

      {coinsEnabled && isPro && (
        <SettingsGroup label="コイン">
          <SettingsRow
            icon="toll"
            label="コイン残高"
            hint={`残り ${coinBalance.totalRemaining}枚（今月分 ${coinBalance.monthlyRemaining} / 購入分 ${coinBalance.purchasedRemaining}）`}
            onClick={() => router.push('/coins')}
          />
        </SettingsGroup>
      )}

      {billingEnabled && !isPro && (
        <div className="px-[18px] pb-4">
          <Link href="/subscription" className="flex items-center gap-2.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-gradient-to-br from-[oklch(0.94_0.06_130)] to-white p-[12px_14px]">
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-accent)]">UPGRADE</span>
                <span className="h-[3px] w-[3px] rounded-full bg-[var(--color-muted)]" />
                <span className="font-mono text-[9px] text-[var(--color-muted)]">月額プラン</span>
              </div>
              <div className="mt-[3px] font-display text-sm font-bold text-[var(--solid-ink)]">Pro でぜんぶ使う</div>
              <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">スキャン無制限・デバイス無制限</div>
            </div>
            <div className="rounded-[8px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-[14px] py-2 font-display text-xs font-bold text-white shadow-[2px_2px_0_var(--color-accent)]">見る</div>
          </Link>
        </div>
      )}

      {isBillingPro && (
        <SettingsGroup label="サブスクリプション">
          <SettingsRow
            icon="receipt_long"
            label={isCancelScheduled ? '解約予定' : 'サブスクリプション管理'}
            hint={isCancelScheduled ? '自動更新停止済み' : '更新停止'}
            onClick={isCancelScheduled ? undefined : () => setShowCancelModal(true)}
            disabled={isCancelScheduled}
          />
        </SettingsGroup>
      )}

      {isAppStorePro && (
        <SettingsGroup label="サブスクリプション">
          <SettingsRow
            icon="open_in_new"
            label="App Storeで管理"
            onClick={() => {
              window.open('https://apps.apple.com/account/subscriptions', '_blank', 'noopener,noreferrer');
            }}
          />
        </SettingsGroup>
      )}

      <Modal isOpen={showCancelModal} onClose={closeModal} showCloseButton={false} closeOnBackdrop={!cancelLoading}>
        <div className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(26,26,26,0.05)] text-[var(--solid-ink)]">
              <Icon name="receipt_long" size={20} />
            </span>
            <div>
              <div className="font-display text-[17px] font-extrabold text-[var(--solid-ink)]">次回更新を停止</div>
              <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">Merken Pro</div>
            </div>
          </div>

          <p className="text-[13px] leading-[1.7] text-[var(--color-muted)]">
            解約後も契約期間終了日まではPro機能を利用できます。
            {periodEndLabel ? ` 現在の利用期限は${periodEndLabel}です。` : ''}
          </p>

          {cancelError && (
            <p className="mt-3 rounded-[9px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-[12px] font-bold text-[var(--color-error)]">
              {cancelError}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={cancelLoading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white py-3 font-display text-[13px] font-bold text-[var(--solid-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={handleCancelSubscription}
              disabled={cancelLoading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3 font-display text-[13px] font-bold text-white shadow-[2px_2px_0_var(--color-accent)] transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-px active:translate-y-px"
            >
              {cancelLoading ? '処理中...' : '更新停止'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-[18px] pb-3">
      <div className="px-1 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">{label}</div>
      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-white">
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  hint?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const isInteractive = Boolean(onClick);
  const inner = (
    <div className={`flex items-center gap-2.5 px-3 py-[11px] ${disabled ? 'opacity-55' : ''} ${isInteractive && !disabled ? 'cursor-pointer' : ''}`}>
      <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[rgba(26,26,26,0.05)] text-[var(--solid-ink)]">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex-1 text-[13px] font-bold text-[var(--solid-ink)]">{label}</span>
      {hint && <span className="font-mono text-[10px] text-[var(--color-muted)]">{hint}</span>}
      {onClick && !disabled && <Icon name="chevron_right" size={14} className="text-[var(--color-muted)]" />}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="block w-full bg-transparent p-0 text-left disabled:cursor-not-allowed"
      >
        {inner}
      </button>
    );
  }
  return inner;
}
