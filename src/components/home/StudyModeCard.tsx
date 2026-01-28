'use client';

import Link from 'next/link';
import { LucideIcon, Sparkles } from 'lucide-react';

type ColorVariant = 'red' | 'blue' | 'green' | 'purple' | 'orange';

interface StudyModeCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
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
  red: {
    bg: 'bg-[var(--color-primary)]',
    iconBg: 'bg-white/20',
    iconColor: 'text-white',
    textColor: 'text-white',
    descColor: 'text-white/80',
    glow: 'shadow-[0_8px_20px_rgba(255,107,107,0.3)]',
  },
  blue: {
    bg: 'bg-[var(--color-peach-light)] dark:bg-[var(--color-surface)]',
    iconBg: 'bg-[var(--color-peach)]/20',
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
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    iconBg: 'bg-purple-200 dark:bg-purple-800/50',
    iconColor: 'text-purple-600 dark:text-purple-400',
    textColor: 'text-[var(--color-foreground)]',
    descColor: 'text-[var(--color-muted)]',
    glow: 'shadow-soft',
  },
  orange: {
    bg: 'bg-[var(--color-peach-light)]',
    iconBg: 'bg-[var(--color-peach)]/30',
    iconColor: 'text-[var(--color-peach)]',
    textColor: 'text-[var(--color-foreground)]',
    descColor: 'text-[var(--color-muted)]',
    glow: 'shadow-soft',
  },
};

export function StudyModeCard({
  title,
  description,
  icon: Icon,
  href,
  variant,
  disabled = false,
  badge,
}: StudyModeCardProps) {
  const styles = variantStyles[variant];

  const content = (
    <div
      className={`relative p-5 rounded-[2rem] ${styles.bg} ${styles.glow} overflow-hidden group ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-card hover:-translate-y-1 transition-all cursor-pointer'
      }`}
    >
      {/* Decorative blur effect */}
      <div className={`absolute -right-4 -top-4 w-24 h-24 ${variant === 'red' ? 'bg-white/20' : 'bg-[var(--color-primary)]/10'} rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500`} />

      {badge && (
        <span className="absolute top-3 right-3 chip chip-pro">
          <Sparkles className="w-3 h-3" />
          {badge}
        </span>
      )}

      <div className="relative z-10 flex flex-col gap-3">
        <div className={`w-10 h-10 rounded-full ${styles.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${styles.iconColor}`} />
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
