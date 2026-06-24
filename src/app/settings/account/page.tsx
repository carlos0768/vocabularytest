'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, Modal, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { isBillingEnabled } from '@/lib/billing/feature';
import type { Subscription } from '@/types';

type SettingsActionModal = 'cancel-subscription' | 'delete-account' | null;

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

function getAccountDeleteError(payload: ApiPayload | null): string {
  if (payload?.code === 'active_appstore_subscription') {
    return 'App Storeでサブスクリプションを解約してから、もう一度お試しください。';
  }

  if (payload?.code === 'missing_stripe_subscription_id') {
    return '課金情報を確認できないため自動削除できません。お問い合わせからご連絡ください。';
  }

  return payload?.error || 'アカウント削除に失敗しました';
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const { subscription, isPro, signOut, refresh } = useAuth();
  const { showToast } = useToast();
  const [activeModal, setActiveModal] = useState<SettingsActionModal>(null);
  const [subscriptionActionLoading, setSubscriptionActionLoading] = useState(false);
  const [accountDeleteLoading, setAccountDeleteLoading] = useState(false);
  const [subscriptionActionError, setSubscriptionActionError] = useState<string | null>(null);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);

  const isBillingPro = isPro && subscription?.proSource === 'billing';
  const isAppStorePro = isPro && subscription?.proSource === 'appstore';
  const billingEnabled = isBillingEnabled();
  const isCancelScheduled = Boolean(subscription?.cancelAtPeriodEnd);
  const periodEndLabel = formatDate(subscription?.currentPeriodEnd);
  const planHint = getPlanHint(subscription, isPro);

  const closeModal = () => {
    if (subscriptionActionLoading || accountDeleteLoading) return;
    setActiveModal(null);
    setSubscriptionActionError(null);
    setAccountDeleteError(null);
  };

  const handleCancelSubscription = async () => {
    if (subscriptionActionLoading || !isBillingPro || isCancelScheduled) return;

    setSubscriptionActionLoading(true);
    setSubscriptionActionError(null);

    try {
      const response = await fetch('/api/subscription/cancel', { method: 'POST' });
      const payload = await response.json().catch(() => null) as ApiPayload | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || '解約処理に失敗しました');
      }

      await refresh();
      setActiveModal(null);
      showToast({
        type: 'success',
        message: payload.message || '次回更新をキャンセルしました',
        duration: 5000,
      });
    } catch (error) {
      setSubscriptionActionError(
        error instanceof Error ? error.message : '解約処理に失敗しました'
      );
    } finally {
      setSubscriptionActionLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (accountDeleteLoading) return;

    setAccountDeleteLoading(true);
    setAccountDeleteError(null);

    try {
      const response = await fetch('/api/account/delete', { method: 'DELETE' });
      const payload = await response.json().catch(() => null) as ApiPayload | null;

      if (!response.ok || !payload?.success) {
        throw new Error(getAccountDeleteError(payload));
      }

      showToast({
        type: 'success',
        message: 'アカウントを削除しました',
        duration: 5000,
      });
      await signOut();
      router.replace('/');
    } catch (error) {
      setAccountDeleteError(
        error instanceof Error ? error.message : 'アカウント削除に失敗しました'
      );
    } finally {
      setAccountDeleteLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="px-[18px] pb-[14px] pt-1">
        <button
          type="button"
          onClick={() => router.push('/settings')}
          className="mb-2 inline-flex items-center gap-0.5 font-display text-[12px] font-bold text-[var(--color-muted)]"
        >
          <Icon name="chevron_left" size={16} />
          設定
        </button>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">ACCOUNT</div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">アカウント</div>
      </div>

      <SettingsGroup label="プラン">
        <SettingsRow icon="credit_card" label="現在のプラン" hint={planHint} />
        {billingEnabled && !isPro && (
          <SettingsRow
            icon="auto_awesome"
            label="Proにアップグレード"
            href="/subscription"
          />
        )}
        {isBillingPro && (
          <SettingsRow
            icon="receipt_long"
            label="サブスクリプション管理"
            hint={isCancelScheduled ? '解約予定' : '更新停止'}
            onClick={isCancelScheduled ? undefined : () => setActiveModal('cancel-subscription')}
            disabled={isCancelScheduled}
          />
        )}
        {isAppStorePro && (
          <SettingsRow
            icon="open_in_new"
            label="App Storeで管理"
            onClick={() => {
              window.open('https://apps.apple.com/account/subscriptions', '_blank', 'noopener,noreferrer');
            }}
          />
        )}
      </SettingsGroup>

      <SettingsGroup label="データ">
        <SettingsRow
          icon="delete"
          label="アカウント削除"
          tone="danger"
          onClick={() => setActiveModal('delete-account')}
        />
      </SettingsGroup>

      <Modal isOpen={activeModal === 'cancel-subscription'} onClose={closeModal} showCloseButton={false} closeOnBackdrop={!subscriptionActionLoading}>
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

          {subscriptionActionError && (
            <p className="mt-3 rounded-[9px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-[12px] font-bold text-[var(--color-error)]">
              {subscriptionActionError}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={subscriptionActionLoading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white py-3 font-display text-[13px] font-bold text-[var(--solid-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={handleCancelSubscription}
              disabled={subscriptionActionLoading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3 font-display text-[13px] font-bold text-white shadow-[2px_2px_0_var(--color-accent)] transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-px active:translate-y-px"
            >
              {subscriptionActionLoading ? '処理中...' : '更新停止'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'delete-account'} onClose={closeModal} showCloseButton={false} closeOnBackdrop={!accountDeleteLoading}>
        <div className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(239,68,68,0.1)] text-[var(--color-error)]">
              <Icon name="delete" size={20} />
            </span>
            <div>
              <div className="font-display text-[17px] font-extrabold text-[var(--solid-ink)]">アカウント削除</div>
              <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">この操作は取り消せません</div>
            </div>
          </div>

          <div className="space-y-2 text-[13px] leading-[1.7] text-[var(--color-muted)]">
            <p>ログイン情報とクラウド上の学習データを削除します。</p>
            <p>Stripe課金中の場合は、削除時にサブスクリプションも停止します。</p>
            {isAppStorePro && (
              <p>App Store課金中の場合は、先にApp Storeでサブスクリプションを解約してください。</p>
            )}
          </div>

          {accountDeleteError && (
            <p className="mt-3 rounded-[9px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-[12px] font-bold text-[var(--color-error)]">
              {accountDeleteError}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={accountDeleteLoading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white py-3 font-display text-[13px] font-bold text-[var(--solid-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={accountDeleteLoading}
              className="flex-1 rounded-[10px] border-2 border-[var(--color-error)] bg-[var(--color-error)] py-3 font-display text-[13px] font-bold text-white transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-px active:translate-y-px"
            >
              {accountDeleteLoading ? '削除中...' : '削除する'}
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
  href,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: string;
  label: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const isInteractive = Boolean(href || onClick);
  const labelClass = tone === 'danger' ? 'text-[var(--color-error)]' : 'text-[var(--solid-ink)]';
  const iconClass = tone === 'danger' ? 'text-[var(--color-error)]' : 'text-[var(--solid-ink)]';
  const inner = (
    <div className={`flex items-center gap-2.5 px-3 py-[11px] ${disabled ? 'opacity-55' : ''} ${isInteractive && !disabled ? 'cursor-pointer' : ''}`}>
      <span className={`inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[rgba(26,26,26,0.05)] ${iconClass}`}>
        <Icon name={icon} size={16} />
      </span>
      <span className={`flex-1 text-[13px] font-bold ${labelClass}`}>{label}</span>
      {hint && <span className="font-mono text-[10px] text-[var(--color-muted)]">{hint}</span>}
      {href && <Icon name="chevron_right" size={14} className="text-[var(--color-muted)]" />}
      {onClick && !disabled && <Icon name="chevron_right" size={14} className="text-[var(--color-muted)]" />}
    </div>
  );

  if (href) return <Link href={href} className="block w-full">{inner}</Link>;
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
