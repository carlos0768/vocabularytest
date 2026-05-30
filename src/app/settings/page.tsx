'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, Modal, useToast } from '@/components/ui';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/components/theme-provider';
import { STRIPE_CONFIG } from '@/lib/stripe/config';
import type { Subscription } from '@/types';

type Theme = 'light' | 'dark' | 'system';
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

export default function SettingsPage() {
  const router = useRouter();
  const {
    user,
    subscription,
    isPro,
    signOut,
    refresh,
    loading: authLoading,
    isAuthenticated,
  } = useAuth();
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
  const {
    username,
    loading: profileLoading,
    saving: profileSaving,
    error: profileError,
    setUsername,
  } = useProfile();
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [activeModal, setActiveModal] = useState<SettingsActionModal>(null);
  const [subscriptionActionLoading, setSubscriptionActionLoading] = useState(false);
  const [accountDeleteLoading, setAccountDeleteLoading] = useState(false);
  const [subscriptionActionError, setSubscriptionActionError] = useState<string | null>(null);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);

  const isBillingPro = isPro && subscription?.proSource === 'billing';
  const isAppStorePro = isPro && subscription?.proSource === 'appstore';
  const isCancelScheduled = Boolean(subscription?.cancelAtPeriodEnd);
  const periodEndLabel = formatDate(subscription?.currentPeriodEnd);
  const planHint = getPlanHint(subscription, isPro);

  const closeModal = () => {
    if (subscriptionActionLoading || accountDeleteLoading) return;
    setActiveModal(null);
    setSubscriptionActionError(null);
    setAccountDeleteError(null);
  };

  const handleSignOut = async () => {
    if (!window.confirm('ログアウトしますか？')) return;
    await signOut();
    router.push('/');
  };

  const startEditingUsername = () => {
    setUsernameInput(username ?? '');
    setIsEditingUsername(true);
  };

  const cancelEditingUsername = () => {
    setUsernameInput(username ?? '');
    setIsEditingUsername(false);
  };

  const handleSaveUsername = async () => {
    if (profileSaving || !usernameInput.trim()) return;
    const success = await setUsername(usernameInput);
    if (success) {
      setIsEditingUsername(false);
    }
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
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:pt-[54px]">
      {/* Header */}
      <div className="px-[18px] pb-[14px] pt-1">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">ACCOUNT</div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">設定</div>
      </div>

      {/* Profile card */}
      <div className="px-[18px] pb-[14px]">
        {authLoading ? (
          <SolidPanel className="!rounded-[14px] !shadow-[2.5px_2.5px_0_var(--solid-ink)]" faceClassName="!p-[14px]">
            <div className="flex h-14 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-foreground)] border-t-transparent" />
            </div>
          </SolidPanel>
        ) : isAuthenticated ? (
          <SolidPanel
            className="!rounded-[14px] !shadow-[2.5px_2.5px_0_var(--solid-ink)]"
            faceClassName="!p-[14px]"
          >
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-gradient-to-br from-[oklch(0.72_0.12_184)] to-[oklch(0.6_0.16_240)] font-display text-[22px] font-extrabold text-white">
                  {(username ?? user?.email ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base font-bold text-[var(--solid-ink)]">
                    {profileLoading ? '読み込み中...' : (username ?? 'ユーザー名未設定')}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-muted)]">{user?.email}</div>
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-[4px] bg-[var(--solid-ink)] px-[7px] py-[2px] font-mono text-[9px] font-bold tracking-[0.05em] text-white">
                    <Icon name="auto_awesome" size={10} />
                    {isPro ? 'PRO PLAN' : 'FREE PLAN'}
                  </div>
                </div>
                {!isEditingUsername && (
                  <button
                    type="button"
                    onClick={startEditingUsername}
                    disabled={profileLoading}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[8px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 font-display text-[12px] font-bold text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-px active:translate-y-px active:shadow-none"
                  >
                    <Icon name="edit" size={14} />
                    変更
                  </button>
                )}
              </div>

              {isEditingUsername && (
                <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                  <label htmlFor="settings-username" className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                    USERNAME
                  </label>
                  <input
                    id="settings-username"
                    type="text"
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSaveUsername();
                      }
                      if (event.key === 'Escape') {
                        cancelEditingUsername();
                      }
                    }}
                    maxLength={20}
                    autoFocus
                    placeholder="ユーザー名を入力"
                    className="mt-1.5 w-full rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none transition-shadow placeholder:text-[var(--color-muted)] focus:shadow-[2px_2px_0_var(--color-accent)]"
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="font-mono text-[9px] text-[var(--color-muted)]">1-20文字</p>
                    <p className="font-mono text-[9px] text-[var(--color-muted)]">{usernameInput.length}/20</p>
                  </div>
                  {profileError && (
                    <p className="mt-2 rounded-[8px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] font-bold text-[var(--color-error)]">
                      {profileError}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveUsername}
                      disabled={profileSaving || !usernameInput.trim()}
                      className="flex-1 rounded-[9px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 font-display text-[13px] font-bold text-white shadow-[2px_2px_0_var(--color-accent)] transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-px active:translate-y-px active:shadow-none"
                    >
                      {profileSaving ? '保存中...' : '保存'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditingUsername}
                      disabled={profileSaving}
                      className="flex-1 rounded-[9px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[13px] font-bold text-[var(--solid-ink)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          </SolidPanel>
        ) : (
          <SolidPanel className="!rounded-[14px] !shadow-[2.5px_2.5px_0_var(--solid-ink)]" faceClassName="!p-[14px]">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
                <Icon name="person" size={28} className="text-[var(--solid-ink)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-base font-bold text-[var(--solid-ink)]">ゲスト</div>
                <div className="mt-0.5 text-xs text-[var(--color-muted)]">ログインでクラウド同期</div>
              </div>
              <Link href="/login" className="rounded-[8px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-2 font-display text-sm font-bold text-white shadow-[2px_2px_0_var(--color-accent)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-none">
                ログイン
              </Link>
            </div>
          </SolidPanel>
        )}
      </div>

      {/* Upgrade banner (Free only) */}
      {!isPro && isAuthenticated && (
        <div className="px-[18px] pb-4">
          <div className="relative">
            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-[12px] bg-[var(--color-accent)]" />
            <Link href="/subscription" className="relative flex items-center gap-2.5 rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-gradient-to-br from-[oklch(0.94_0.06_130)] to-white p-[12px_14px]">
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-accent)]">UPGRADE</span>
                  <span className="h-[3px] w-[3px] rounded-full bg-[var(--color-muted)]" />
                  <span className="font-mono text-[9px] text-[var(--color-muted)]">¥{STRIPE_CONFIG.plans.pro.price.toLocaleString()}/月</span>
                </div>
                <div className="mt-[3px] font-display text-sm font-bold text-[var(--solid-ink)]">Pro でぜんぶ使う</div>
                <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">スキャン無制限・クラウド同期・デバイス無制限</div>
              </div>
              <div className="rounded-[8px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-[14px] py-2 font-display text-xs font-bold text-white shadow-[2px_2px_0_var(--color-accent)]">見る</div>
            </Link>
          </div>
        </div>
      )}

      {isAuthenticated && (
        <SettingsGroup label="アカウント">
          <SettingsRow icon="credit_card" label="現在のプラン" hint={planHint} />
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
          <SettingsRow
            icon="delete"
            label="アカウント削除"
            tone="danger"
            onClick={() => setActiveModal('delete-account')}
          />
        </SettingsGroup>
      )}

      {/* 表示 */}
      <SettingsGroup label="表示">
        <SettingsRow icon="palette" label="テーマ">
          <div className="flex gap-1">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`rounded-[6px] border-[1.25px] px-2 py-1 font-mono text-[9px] font-bold transition-colors ${theme === t ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white' : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'}`}
              >
                {{ light: 'ライト', dark: 'ダーク', system: 'システム' }[t]}
              </button>
            ))}
          </div>
        </SettingsRow>
      </SettingsGroup>

      {/* サポート */}
      <SettingsGroup label="サポート">
        <SettingsRow icon="description" label="利用規約" href="/terms" />
        <SettingsRow icon="shield" label="プライバシーポリシー" href="/privacy" />
        <SettingsRow icon="storefront" label="特定商取引法に基づく表記" href="/tokusho" />
        <SettingsRow icon="mail" label="お問い合わせ" href="/contact" />
      </SettingsGroup>

      {/* Logout */}
      {isAuthenticated && (
        <div className="px-[18px] pb-6">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-[12px] border-[1.25px] border-[var(--color-error)] bg-white py-3 font-display text-[13px] font-bold text-[var(--color-error)]"
          >
            ログアウト
          </button>
          <div className="mt-2.5 text-center font-mono text-[9px] text-[var(--color-muted)]">
            Merken · v2026.01
          </div>
        </div>
      )}

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
              className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white py-3 font-display text-[13px] font-bold text-[var(--solid-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={handleCancelSubscription}
              disabled={subscriptionActionLoading}
              className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3 font-display text-[13px] font-bold text-white shadow-[2px_2px_0_var(--color-accent)] transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-px active:translate-y-px active:shadow-none"
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
              className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white py-3 font-display text-[13px] font-bold text-[var(--solid-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={accountDeleteLoading}
              className="flex-1 rounded-[10px] border-[1.25px] border-[var(--color-error)] bg-[var(--color-error)] py-3 font-display text-[13px] font-bold text-white transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-px active:translate-y-px"
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
      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-white shadow-[2.5px_2.5px_0_var(--solid-ink)]">
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
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: string;
  label: string;
  hint?: string;
  href?: string;
  children?: React.ReactNode;
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
      {children}
      {href && !children && <Icon name="chevron_right" size={14} className="text-[var(--color-muted)]" />}
      {onClick && !children && !disabled && <Icon name="chevron_right" size={14} className="text-[var(--color-muted)]" />}
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
