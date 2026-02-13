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
  layout?: 'vertical' | 'horizontal';
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
    bg: 'bg-[#2563EB]',
    iconBg: 'bg-white/20',
    iconColor: 'text-white',
    textColor: 'text-white',
    descColor: 'text-white/85',
    glow: 'shadow-glow',
  },
  red: {
    bg: 'bg-[#2563EB]',
    iconBg: 'bg-white/20',
    iconColor: 'text-white',
    textColor: 'text-white',
    descColor: 'text-white/85',
    glow: 'shadow-glow',
  },
  blue: {
    bg: 'bg-[#3B82F6]',
    iconBg: 'bg-white/20',
    iconColor: 'text-white',
    textColor: 'text-white',
    descColor: 'text-white/85',
    glow: 'shadow-glow',
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
    bg: 'bg-[#60A5FA]',
    iconBg: 'bg-white/20',
    iconColor: 'text-white',
    textColor: 'text-white',
    descColor: 'text-white/85',
    glow: 'shadow-glow',
  },
  purple: {
    bg: 'bg-[#93C5FD]',
    iconBg: 'bg-white/25',
    iconColor: 'text-[#1E40AF]',
    textColor: 'text-[#1E3A5F]',
    descColor: 'text-[#1E3A5F]/75',
    glow: 'shadow-glow',
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
  layout = 'vertical',
}: StudyModeCardProps) {
  const styles = variantStyles[variant];

  const isHorizontal = layout === 'horizontal';

  const content = (
    <div
      className={`relative ${isHorizontal ? 'p-4' : 'p-5'} rounded-[var(--radius-xl)] ${styles.bg} ${styles.glow} overflow-hidden group border border-[var(--color-border)] ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-card hover:-translate-y-0.5 transition-all cursor-pointer'
      }`}
    >
      {badge && (
        <span className={`absolute ${isHorizontal ? 'top-2.5 right-3' : 'top-3 right-3'} chip chip-pro`}>
          <Icon name="auto_awesome" size={14} />
          {badge}
        </span>
      )}

      <div className={`relative z-10 flex ${isHorizontal ? 'flex-row items-center gap-3.5' : 'flex-col gap-3'}`}>
        <div className={`${isHorizontal ? 'w-11 h-11' : 'w-10 h-10'} rounded-full ${styles.iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon name={icon} size={isHorizontal ? 24 : 22} className={styles.iconColor} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`font-bold ${isHorizontal ? 'text-base' : 'text-lg'} leading-tight ${styles.textColor}`}>{title}</h3>
          <p className={`text-xs mt-0.5 font-medium ${styles.descColor}`}>{description}</p>
        </div>
        {isHorizontal && !disabled && (
          <Icon name="chevron_right" size={20} className={`${styles.descColor} flex-shrink-0`} />
        )}
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
