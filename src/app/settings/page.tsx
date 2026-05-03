'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/components/theme-provider';
import { useWordCount } from '@/hooks/use-word-count';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { STRIPE_CONFIG } from '@/lib/stripe/config';

type Theme = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const router = useRouter();
  const { user, isPro, signOut, loading: authLoading, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const { count: wordCount, loading: wordCountLoading } = useWordCount();
  const { username, loading: profileLoading } = useProfile();
  const { aiEnabled, loading: userPreferencesLoading, saving: userPreferencesSaving, setAiEnabled } = useUserPreferences();

  const handleSignOut = async () => {
    if (!window.confirm('ログアウトしますか？')) return;
    await signOut();
    router.push('/');
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
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-gradient-to-br from-[oklch(0.72_0.12_184)] to-[oklch(0.6_0.16_240)] font-display text-[22px] font-extrabold text-white">
                {(username ?? user?.email ?? '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-base font-bold text-[var(--solid-ink)]">
                  {profileLoading ? '読み込み中...' : (username ?? 'ユーザー名未設定')}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-[var(--color-muted)]">{user?.email}</div>
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-[4px] bg-[var(--solid-ink)] px-[7px] py-[2px] font-mono text-[9px] font-bold tracking-[0.05em] text-white">
                  <Icon name="auto_awesome" size={10} />
                  {isPro ? 'PRO PLAN' : 'FREE PLAN'}
                </div>
              </div>
              <span className="text-[var(--color-muted)]"><Icon name="chevron_right" size={16} /></span>
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

      {/* 学習 */}
      <SettingsGroup label="学習">
        <SettingsRow icon="psychology" label="AI補助">
          <button
            type="button"
            onClick={() => setAiEnabled(!(aiEnabled !== false))}
            disabled={userPreferencesLoading || userPreferencesSaving}
            className={`h-5 w-[34px] rounded-full border-[1.25px] border-[var(--solid-ink)] p-0.5 transition-colors ${aiEnabled !== false ? 'bg-[var(--color-accent)]' : 'bg-[rgba(26,26,26,0.15)]'}`}
          >
            <span className={`block h-3.5 w-3.5 rounded-full border border-[var(--solid-ink)] bg-white transition-transform ${aiEnabled !== false ? 'translate-x-[14px]' : 'translate-x-0'}`} />
          </button>
        </SettingsRow>
        <SettingsRow icon="data_usage" label="保存済み単語" hint={wordCountLoading ? '集計中...' : `${wordCount.toLocaleString()}語`} />
      </SettingsGroup>

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
    </div>
  );
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-[18px] pb-3">
      <div className="px-1 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">{label}</div>
      <div className="overflow-hidden rounded-[12px] border-[1.25px] border-[var(--solid-ink)] bg-white shadow-[2.5px_2.5px_0_var(--solid-ink)]">
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
}: {
  icon: string;
  label: string;
  hint?: string;
  href?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-3 py-[11px] last:border-b-0">
      <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[rgba(26,26,26,0.05)] text-[var(--solid-ink)]">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex-1 text-[13px] font-medium text-[var(--solid-ink)]">{label}</span>
      {hint && <span className="font-mono text-[10px] text-[var(--color-muted)]">{hint}</span>}
      {children}
      {href && !children && <Icon name="chevron_right" size={14} className="text-[var(--color-muted)]" />}
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}
