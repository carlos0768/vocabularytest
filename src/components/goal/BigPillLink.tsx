'use client';

// ホームの一番上の「今日の10問」「今日復習しておきたい単語」に使う横長のリンク。
// 角はホームの単語帳タイル (HomeShortcutGrid, 12px) に揃える。
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export function BigPillLink({
  href,
  onNavigate,
  icon,
  badge,
  title,
  sub,
  tone,
}: {
  href: string | null;
  /** リンク遷移の直前に実行する副作用 (例: 出題対象の単語帳を sessionStorage に渡す) */
  onNavigate?: () => void;
  icon: string;
  badge: string;
  title: string;
  /** 見出しの下の1行。無ければ出さない */
  sub?: string;
  tone: 'accent' | 'ink';
}) {
  const enabled = href !== null;
  const className = `flex w-full items-center gap-3 rounded-[12px] border-2 px-3 py-2.5 text-left transition-all short:py-1.5 duration-100 ${
    !enabled
      ? 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-muted)]'
      : tone === 'accent'
        ? 'border-[var(--color-accent-ink)] bg-[var(--color-accent)] text-[var(--color-on-accent)] active:translate-x-px active:translate-y-px'
        : 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] active:translate-x-px active:translate-y-px'
  }`;
  const inner = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] font-display text-[15px] font-black ${
          !enabled
            ? 'bg-[var(--color-surface)] text-[var(--color-muted)]'
            : tone === 'accent'
              ? 'bg-[var(--color-on-accent)] text-[var(--color-accent)]'
              : 'bg-[var(--solid-ink)] text-[var(--color-on-ink)]'
        }`}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[16px] font-black leading-tight">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-[11px] font-bold opacity-85">{sub}</span>}
      </span>
      <Icon name={enabled ? 'arrow_forward' : icon} size={20} className="shrink-0" />
    </>
  );
  if (!enabled) {
    return <div className={className} aria-disabled>{inner}</div>;
  }
  return (
    <Link href={href} className={className} onClick={onNavigate}>
      {inner}
    </Link>
  );
}
