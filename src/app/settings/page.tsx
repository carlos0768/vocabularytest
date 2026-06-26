'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DesktopSettingsView } from '@/components/desktop/DesktopAccount';
import { Icon } from '@/components/ui';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { isBillingEnabled } from '@/lib/billing/feature';

export default function SettingsPage() {
  const router = useRouter();
  const {
    user,
    isPro,
    signOut,
    loading: authLoading,
    isAuthenticated,
  } = useAuth();
  const {
    username,
    accountId,
    loading: profileLoading,
  } = useProfile();

  const billingEnabled = isBillingEnabled();

  const handleSignOut = async () => {
    if (!window.confirm('ログアウトしますか？')) return;
    await signOut();
    router.push('/');
  };

  return (
    <>
      <DesktopSettingsView
        email={user?.email}
        username={username}
        accountId={accountId}
        isPro={isPro}
        onSignOut={() => void handleSignOut()}
      />
      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      {/* Header */}
      <div className="px-[18px] pb-[14px] pt-1">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">ACCOUNT</div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">設定</div>
      </div>

      {/* Profile card */}
      <div className="px-[18px] pb-[14px]">
        {authLoading ? (
          <SolidPanel className="!rounded-[14px] !" faceClassName="!p-[14px]">
            <div className="flex h-14 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-foreground)] border-t-transparent" />
            </div>
          </SolidPanel>
        ) : isAuthenticated ? (
          <SolidPanel
            className="!rounded-[14px] !"
            faceClassName="!p-[14px]"
          >
            <div className="flex items-center gap-3">
              <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-gradient-to-br from-[oklch(0.72_0.12_184)] to-[oklch(0.6_0.16_240)] font-display text-[22px] font-extrabold text-white">
                  {(username ?? user?.email ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base font-bold text-[var(--solid-ink)]">
                    {profileLoading ? '読み込み中...' : (username ?? 'ユーザー名未設定')}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-muted)]">{user?.email}</div>
                  {accountId && (
                    <div className="mt-0.5 truncate font-mono text-[10px] font-bold text-[var(--color-muted)]">@{accountId}</div>
                  )}
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-[4px] bg-[var(--solid-ink)] px-[7px] py-[2px] font-mono text-[9px] font-bold tracking-[0.05em] text-white">
                    <Icon name="auto_awesome" size={10} />
                    {isPro ? 'PRO PLAN' : 'FREE PLAN'}
                  </div>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => router.push('/settings/account/profile')}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[8px] border-2 border-[var(--solid-ink)] bg-white px-3 font-display text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
              >
                <Icon name="edit" size={14} />
                変更
              </button>
            </div>
          </SolidPanel>
        ) : (
          <SolidPanel className="!rounded-[14px] !" faceClassName="!p-[14px]">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
                <Icon name="person" size={28} className="text-[var(--solid-ink)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-base font-bold text-[var(--solid-ink)]">ゲスト</div>
                <div className="mt-0.5 text-xs text-[var(--color-muted)]">ログインしてデータを保存</div>
              </div>
              <Link href="/login" className="rounded-[8px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-2 font-display text-sm font-bold text-white shadow-[2px_2px_0_var(--color-accent)] transition-all duration-100 active:translate-x-px active:translate-y-px">
                ログイン
              </Link>
            </div>
          </SolidPanel>
        )}
      </div>

      {/* Upgrade banner (Free only) */}
      {billingEnabled && !isPro && isAuthenticated && (
        <div className="px-[18px] pb-4">
          <div>
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
        </div>
      )}

      {/* Navigation groups */}
      <SettingsGroup label="カスタマイズ">
        <SettingsRow icon="tune" label="通知・パーソナライズ" description="学習リマインダー、例文ジャンル" href="/settings/customize" />
      </SettingsGroup>

      {isAuthenticated && (
        <SettingsGroup label="アカウント">
          <SettingsRow icon="manage_accounts" label="プラン・アカウント管理" description="プラン確認、サブスクリプション、アカウント削除" href="/settings/account" />
        </SettingsGroup>
      )}

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
            className="w-full rounded-[12px] border-2 border-[var(--color-error)] bg-white py-3 font-display text-[13px] font-bold text-[var(--color-error)]"
          >
            ログアウト
          </button>
          <div className="mt-2.5 text-center font-mono text-[9px] text-[var(--color-muted)]">
            Merken · v2026.01
          </div>
        </div>
      )}
      </div>
    </>
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
  description,
  hint,
  href,
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: string;
  label: string;
  description?: string;
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
      <div className="min-w-0 flex-1">
        <span className={`text-[13px] font-bold ${labelClass}`}>{label}</span>
        {description && (
          <p className="mt-px truncate text-[10px] leading-4 text-[var(--color-muted)]">{description}</p>
        )}
      </div>
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
