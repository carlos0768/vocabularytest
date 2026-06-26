'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { isBillingEnabled } from '@/lib/billing/feature';
import type { Subscription } from '@/types';

function getPlanHint(subscription: Subscription | null, isPro: boolean): string {
  if (!isPro) return 'FREE';
  if (subscription?.proSource === 'billing') return 'PRO';
  if (subscription?.proSource === 'appstore') return 'APP STORE';
  if (subscription?.proSource === 'test') return 'TEST';
  return 'PRO';
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const { subscription, isPro } = useAuth();
  const { username, accountId, loading: profileLoading } = useProfile();
  const billingEnabled = isBillingEnabled();
  const planHint = getPlanHint(subscription, isPro);

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="px-[18px] pb-[14px] pt-1">
        <button
          type="button"
          onClick={() => router.push('/settings')}
          aria-label="設定へ戻る"
          className="mb-2 flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="chevron_left" size={20} />
        </button>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">ACCOUNT</div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">アカウント</div>
      </div>

      <SettingsGroup label="プロフィール">
        <SettingsRow
          icon="person"
          label="ID・ユーザー名の変更"
          hint={profileLoading ? '...' : (accountId ? `@${accountId}` : (username ?? '未設定'))}
          href="/settings/account/profile"
        />
      </SettingsGroup>

      <SettingsGroup label="プラン">
        <SettingsRow
          icon="credit_card"
          label="プラン・サブスクリプション"
          hint={planHint}
          href="/settings/account/plan"
        />
        {billingEnabled && !isPro && (
          <SettingsRow
            icon="auto_awesome"
            label="Proにアップグレード"
            href="/subscription"
          />
        )}
      </SettingsGroup>

      <SettingsGroup label="データ">
        <SettingsRow
          icon="delete"
          label="アカウント削除"
          tone="danger"
          href="/settings/account/delete"
        />
      </SettingsGroup>
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
  tone = 'default',
}: {
  icon: string;
  label: string;
  hint?: string;
  href: string;
  tone?: 'default' | 'danger';
}) {
  const labelClass = tone === 'danger' ? 'text-[var(--color-error)]' : 'text-[var(--solid-ink)]';
  const iconClass = tone === 'danger' ? 'text-[var(--color-error)]' : 'text-[var(--solid-ink)]';
  return (
    <Link href={href} className="block w-full">
      <div className="flex cursor-pointer items-center gap-2.5 px-3 py-[11px]">
        <span className={`inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[rgba(26,26,26,0.05)] ${iconClass}`}>
          <Icon name={icon} size={16} />
        </span>
        <span className={`flex-1 text-[13px] font-bold ${labelClass}`}>{label}</span>
        {hint && <span className="font-mono text-[10px] text-[var(--color-muted)]">{hint}</span>}
        <Icon name="chevron_right" size={14} className="text-[var(--color-muted)]" />
      </div>
    </Link>
  );
}
