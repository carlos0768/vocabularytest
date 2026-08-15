'use client';

/**
 * 対戦機能まわりのボタン。アプリ共通の枠線＋ハードシャドウの見た目に揃える。
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

type BattleButtonVariant = 'primary' | 'outline' | 'quiet';

const VARIANT_CLASSES: Record<BattleButtonVariant, string> = {
  primary:
    'border-[var(--solid-ink)] bg-[var(--color-accent)] text-white shadow-[2px_3px_0_var(--solid-ink)] active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]',
  outline:
    'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)] active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]',
  quiet:
    'border-transparent bg-transparent text-[var(--color-muted)] shadow-none',
};

const BASE_CLASSES =
  'inline-flex w-full items-center justify-center gap-2 rounded-[14px] border-2 px-5 py-3.5 font-display text-[15px] font-bold transition-all duration-100 disabled:opacity-45 disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0';

export function BattleButton({
  variant = 'primary',
  icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BattleButtonVariant;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`} {...props}>
      {icon && <Icon name={icon} size={18} className="shrink-0" />}
      {children}
    </button>
  );
}

export function BattleLinkButton({
  href,
  variant = 'primary',
  icon,
  children,
}: {
  href: string;
  variant?: BattleButtonVariant;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} no-underline`}>
      {icon && <Icon name={icon} size={18} className="shrink-0" />}
      {children}
    </Link>
  );
}
