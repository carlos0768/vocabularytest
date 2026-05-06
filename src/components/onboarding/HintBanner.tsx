'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';

interface HintBannerProps {
  icon?: string;
  title: string;
  description?: string;
  href?: string;
  onClick?: () => void;
  ctaLabel?: string;
  /** Tone selects the gradient & accent. Defaults to 'accent'. */
  tone?: 'accent' | 'amber' | 'violet';
  className?: string;
}

const TONE = {
  accent: {
    bg: 'linear-gradient(132deg, #ecfdf5 0%, #dcfce7 100%)',
    accent: '#15803d',
    accentInk: '#14532d',
  },
  amber: {
    bg: 'linear-gradient(132deg, #fffbeb 0%, #fef3c7 100%)',
    accent: '#b45309',
    accentInk: '#78350f',
  },
  violet: {
    bg: 'linear-gradient(132deg, #f5f3ff 0%, #ede9fe 100%)',
    accent: '#6d28d9',
    accentInk: '#4c1d95',
  },
} as const;

export function HintBanner({
  icon = 'auto_awesome',
  title,
  description,
  href,
  onClick,
  ctaLabel,
  tone = 'accent',
  className,
}: HintBannerProps) {
  const palette = TONE[tone];

  const inner = (
    <div className="relative">
      <div
        aria-hidden
        className="absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]"
        style={{ transform: 'translate(2.5px, 3px)' }}
      />
      <div
        className="relative flex items-center gap-3 rounded-[14px] border-[1.5px] border-[var(--solid-ink)] px-3.5 py-3"
        style={{ background: palette.bg }}
      >
        <motion.div
          aria-hidden
          initial={{ scale: 0.85, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-[var(--solid-ink)] bg-white shadow-[1.5px_1.5px_0_var(--solid-ink)]"
          style={{ color: palette.accent }}
        >
          <Icon name={icon} size={20} filled />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[14px] font-extrabold leading-[1.25] text-[var(--solid-ink)]">
            {title}
          </div>
          {description && (
            <div className="mt-0.5 text-[11.5px] leading-[1.4] text-[var(--color-ink-muted)]">
              {description}
            </div>
          )}
        </div>
        {(href || onClick || ctaLabel) && (
          <motion.div
            aria-hidden
            initial={{ x: 0 }}
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="shrink-0"
            style={{ color: palette.accentInk }}
          >
            <Icon name="chevron_right" size={20} />
          </motion.div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={title}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`block w-full text-left ${className ?? ''}`} aria-label={title}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}
