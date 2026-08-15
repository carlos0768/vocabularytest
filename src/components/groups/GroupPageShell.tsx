'use client';

/**
 * グループ配下のサブページ（メンバー / ランキング / 単語一覧 / 対戦）の共通枠。
 * ハブと同じく、ヘッダを画面上部に固定して本文だけスクロールさせる。
 */

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export function GroupPageShell({
  eyebrow,
  title,
  backHref,
  right,
  headerExtra,
  bodyClassName,
  children,
}: {
  eyebrow: string;
  title: string;
  /** 戻り先。履歴があれば戻る、無ければここへ。 */
  backHref: string;
  right?: ReactNode;
  /** ヘッダ下段（検索欄など）も固定領域に含めたいとき。 */
  headerExtra?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const handleBack = () => {
    triggerHaptic();
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(backHref);
  };

  return (
    <div className="fixed inset-x-0 top-0 z-30 flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)]">
      <header
        className="shrink-0 border-b-2 border-[var(--color-border)] bg-[var(--color-background)] px-[14px] pb-2.5"
        style={{ paddingTop: 'max(10px, calc(env(safe-area-inset-top) + 10px))' }}
      >
        <div className="mx-auto w-full max-w-[560px]">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleBack}
              aria-label="戻る"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="arrow_back" size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9.5px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
                {eyebrow}
              </div>
              <div className="truncate font-display text-[15px] font-extrabold leading-tight text-[var(--solid-ink)]">
                {title}
              </div>
            </div>
            {right}
          </div>
          {headerExtra}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className={cn('mx-auto flex w-full max-w-[560px] flex-col px-[14px] pt-3', bodyClassName)}
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function GroupPageLoading({ label = '読み込み中...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
      <Icon name="progress_activity" className="animate-spin" size={20} />
      <span className="ml-2 text-sm font-bold">{label}</span>
    </div>
  );
}

export function GroupPageEmpty({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-4 py-10 text-center">
      <Icon name={icon} size={26} className="text-[var(--color-muted)]" />
      <p className="mt-2 text-[12.5px] font-bold text-[var(--color-muted)]">{message}</p>
    </div>
  );
}
