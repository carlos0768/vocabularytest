'use client';

/**
 * 対戦画面の共通シェル。
 *
 * ヘッダを画面上部に固定し、本文だけがスクロールする構成（語法演習・クイズと
 * 同じ「固定ビューポート」パターン）。モバイルでは body の safe-area padding を
 * 抜けるために fixed で置き、デスクトップでは ds-live-main（100dvh・overflow
 * hidden のグリッド列）の中に収まるよう static に戻す。
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export function BattleScreen({
  header,
  footer,
  children,
  /** ボトムナビが重なる画面（ロビー）では下に余白を足す。 */
  bodyClassName,
  center = false,
}: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  /** 本文を上下中央に置く（待機・結果画面）。 */
  center?: boolean;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-30 flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:static lg:z-auto lg:h-full">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className={cn(
            'mx-auto flex w-full max-w-[560px] flex-col px-[18px]',
            center && 'min-h-full justify-center',
            bodyClassName,
          )}
        >
          {children}
        </div>
      </div>
      {footer && (
        <div
          className="shrink-0 border-t-2 border-[var(--color-border)] bg-[var(--color-background)] px-[18px] pt-2.5"
          style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto w-full max-w-[560px]">{footer}</div>
        </div>
      )}
    </div>
  );
}

/**
 * 固定ヘッダ。上段は 戻る + ラベル + 右アクション、`children` があれば
 * その下（スコアボードやタイマー）も固定領域に含める。
 */
export function BattleScreenHeader({
  eyebrow,
  title,
  backHref,
  onBack,
  right,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  /** 戻り先。onBack と両方省略すると戻るボタンを出さない。 */
  backHref?: string;
  onBack?: () => void;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  const showBack = Boolean(backHref || onBack);

  return (
    <header
      className="shrink-0 border-b-2 border-[var(--color-border)] bg-[var(--color-background)] px-[18px] pb-2.5"
      style={{ paddingTop: 'max(10px, calc(env(safe-area-inset-top) + 10px))' }}
    >
      <div className="mx-auto w-full max-w-[560px]">
        <div className="flex items-center gap-2.5">
          {showBack && (
            <button
              type="button"
              onClick={onBack ?? (() => router.push(backHref as string))}
              aria-label="戻る"
              className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="chevron_left" size={18} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
              {eyebrow}
            </div>
            <div className="truncate font-display text-[17px] font-extrabold leading-tight text-[var(--solid-ink)]">
              {title}
            </div>
          </div>
          {right}
        </div>
        {children}
      </div>
    </header>
  );
}

/** 画面中央に置く案内パネル（ログイン誘導・Pro誘導・エラー）。 */
export function BattleNotice({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
}) {
  return (
    <div className="rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-7 text-center shadow-[3px_4px_0_var(--solid-ink)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
        <Icon name={icon} size={26} className="text-[var(--solid-ink)]" />
      </div>
      <h2 className="font-display text-[18px] font-black text-[var(--solid-ink)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-[1.7] text-[var(--color-muted)]">
        {description}
      </p>
      {action && (
        <Link
          href={action.href}
          className="mt-5 flex h-12 items-center justify-center rounded-[12px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] font-display text-[15px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          {action.label}
        </Link>
      )}
      {secondaryAction && (
        <Link
          href={secondaryAction.href}
          className="mt-2.5 flex h-11 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[14px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          {secondaryAction.label}
        </Link>
      )}
    </div>
  );
}

/** 待機中パネル（マッチング中・相手待ち・問題生成中）。 */
export function BattleWaitingPanel({
  title,
  description,
  children,
  onCancel,
  cancelLabel = 'キャンセル',
}: {
  title: string;
  description: string;
  children?: ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-6 flex h-[72px] w-[72px] items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full border-2 border-[var(--color-accent)] opacity-40" />
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-white shadow-[3px_4px_0_var(--solid-ink)]">
          <Icon name="swords" size={30} />
        </span>
      </div>

      <h2 className="font-display text-[19px] font-black text-[var(--solid-ink)]">{title}</h2>
      <p className="mt-2 max-w-[300px] text-[13px] leading-[1.7] text-[var(--color-muted)]">
        {description}
      </p>

      {children && <div className="mt-6 w-full">{children}</div>}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-7 h-11 w-full max-w-[280px] rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[14px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          {cancelLabel}
        </button>
      )}
    </div>
  );
}
