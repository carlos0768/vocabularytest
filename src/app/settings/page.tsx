'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DesktopSettingsView } from '@/components/desktop/DesktopAccount';
import { Icon } from '@/components/ui';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { ReviewLimitPicker } from '@/components/settings/ReviewLimitPicker';
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
            <Link href="/profile" className="flex items-center gap-3">
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
              <Icon name="chevron_right" size={22} className="shrink-0 text-[var(--color-muted)]" />
            </Link>
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

      {/* 語彙力レベル診断 — 目を引くカラフルな特別カード */}
      <div className="px-[18px] pb-3">
        <div className="px-1 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">学習ツール</div>
        <Link
          href="/level-test"
          className="block rounded-[14px] p-[3px] shadow-[3px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--solid-ink)]"
          style={{ background: 'linear-gradient(120deg,#15803d,#137FEC,#7C3AED,#EE2A7B,#F9CE34)' }}
        >
          <div className="flex items-center gap-3 rounded-[11px] bg-white px-3 py-3">
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] text-white"
              style={{ background: 'linear-gradient(135deg,#137FEC,#7C3AED,#EE2A7B)' }}
            >
              <Icon name="military_tech" size={20} filled />
            </span>
            <div className="min-w-0 flex-1">
              <span
                className="font-display text-[15px] font-extrabold"
                style={{
                  background: 'linear-gradient(90deg,#15803d,#137FEC,#7C3AED,#EE2A7B)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                語彙力レベル診断
              </span>
              <p className="mt-px truncate text-[10px] leading-4 text-[var(--color-muted)]">あなたの語彙力は英検何級レベル? 20問で診断</p>
            </div>
            <Icon name="chevron_right" size={16} className="text-[var(--solid-ink)]" />
          </div>
        </Link>
      </div>

      {/* 豆知識 — 語源（接頭語・接尾語・接中語）コーナー */}
      <SettingsGroup label="豆知識">
        <SettingsRow icon="text_fields" label="接頭語（プレフィックス）" description="un- / re- / pre- など、頭に付くパーツの意味と例" href="/tips/prefixes" />
        <SettingsRow icon="text_fields" label="接尾語（サフィックス）" description="-tion / -ous / -able など、品詞を決めるパーツ" href="/tips/suffixes" />
        <SettingsRow icon="text_fields" label="接中語（インフィックス）" description="therm-o-meter の -o- など、語根をつなぐパーツ" href="/tips/infixes" />
      </SettingsGroup>

      <SettingsGroup label="学習">
        <div className="px-3 py-[11px]">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[rgba(26,26,26,0.05)] text-[var(--solid-ink)]">
              <Icon name="event_repeat" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[13px] font-bold text-[var(--solid-ink)]">1日の復習上限</span>
              <p className="mt-px text-[10px] leading-4 text-[var(--color-muted)]">
                復習クイズに出す問題数の上限。間違いが多い単語・CEFRが高い単語から優先して選ばれます
              </p>
            </div>
          </div>
          <ReviewLimitPicker className="mt-2.5 pl-[36.5px]" />
        </div>
      </SettingsGroup>

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
