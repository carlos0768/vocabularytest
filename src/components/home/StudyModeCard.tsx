'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

type ColorVariant = 'primary' | 'blue' | 'green' | 'orange' | 'red' | 'purple';

interface StudyModeCardProps {
  title: string;
  description: string;
  icon: string;
  href: string;
  variant: ColorVariant;
  disabled?: boolean;
  badge?: string;
}

const variantStyles: Record<ColorVariant, {
  bg: string;
  iconBg: string;
  iconColor: string;
  textColor: string;
  descColor: string;
  glow: string;
}> = {
  primary: {
    bg: 'bg-[var(--color-primary)]',
    iconBg: 'bg-white/20',
    iconColor: 'text-white',
    textColor: 'text-white',
    descColor: 'text-white/85',
    glow: 'shadow-glow',
  },
  red: {
    bg: 'bg-[var(--color-primary)]',
    iconBg: 'bg-white/20',
    iconColor: 'text-white',
    textColor: 'text-white',
    descColor: 'text-white/85',
    glow: 'shadow-glow',
  },
  blue: {
    bg: 'bg-[var(--color-surface)]',
    iconBg: 'bg-[var(--color-primary-light)]',
    iconColor: 'text-[var(--color-primary)]',
    textColor: 'text-[var(--color-foreground)]',
    descColor: 'text-[var(--color-muted)]',
    glow: 'shadow-soft',
  },
  green: {
    bg: 'bg-[var(--color-success-light)]',
    iconBg: 'bg-[var(--color-success)]/20',
    iconColor: 'text-[var(--color-success)]',
    textColor: 'text-[var(--color-foreground)]',
    descColor: 'text-[var(--color-muted)]',
    glow: 'shadow-soft',
  },
  orange: {
    bg: 'bg-[var(--color-warning-light)]',
    iconBg: 'bg-[var(--color-warning)]/25',
    iconColor: 'text-[var(--color-warning)]',
    textColor: 'text-[var(--color-foreground)]',
    descColor: 'text-[var(--color-muted)]',
    glow: 'shadow-soft',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    iconBg: 'bg-purple-500/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
    textColor: 'text-[var(--color-foreground)]',
    descColor: 'text-[var(--color-muted)]',
    glow: 'shadow-soft',
  },
};

export function StudyModeCard({
  title,
  description,
  icon,
  href,
  variant,
  disabled = false,
  badge,
}: StudyModeCardProps) {
  const styles = variantStyles[variant];

  const content = (
    <div
      className={`relative p-5 rounded-[var(--radius-xl)] ${styles.bg} ${styles.glow} overflow-hidden group border border-[var(--color-border)] ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-card hover:-translate-y-1 transition-all cursor-pointer'
      }`}
    >
      {badge && (
        <span className="absolute top-3 right-3 chip chip-pro">
          <Icon name="auto_awesome" size={14} />
          {badge}
        </span>
      )}

      <div className="relative z-10 flex flex-col gap-3">
        <div className={`w-10 h-10 rounded-full ${styles.iconBg} flex items-center justify-center`}>
          <Icon name={icon} size={22} className={styles.iconColor} />
        </div>
        <div className="min-w-0">
          <h3 className={`font-bold text-lg leading-tight ${styles.textColor}`}>{title}</h3>
          <p className={`text-xs mt-1 font-medium ${styles.descColor}`}>{description}</p>
        </div>
      </div>
    </div>
  );

  if (disabled) {
    return content;
  }

  return (
    <Link href={href}>
      {content}
    </Link>
  );
}
