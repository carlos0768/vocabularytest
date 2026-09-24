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

/**
 * Tone tints are mixed into --color-surface rather than written as literal
 * pastels: the same expression yields a pale wash on the white light surface
 * and a deep wash on the dark one, so the banner never glares in dark mode.
 */
const tint = (hue: string) =>
  `linear-gradient(132deg, color-mix(in srgb, ${hue} 6%, var(--color-surface)) 0%, color-mix(in srgb, ${hue} 14%, var(--color-surface)) 100%)`;

const TONE = {
  accent: {
    bg: tint('var(--color-accent)'),
    accent: 'var(--color-accent)',
    accentInk: 'var(--color-accent-ink)',
  },
  amber: {
    bg: tint('var(--color-warning)'),
    accent: 'var(--color-warning-ink)',
    accentInk: 'var(--color-warning-ink)',
  },
  violet: {
    bg: tint('var(--color-violet)'),
    accent: 'var(--color-violet)',
    accentInk: 'var(--color-violet-ink)',
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
        className="relative flex items-center gap-3 rounded-[14px] border-2 border-[var(--solid-ink)] px-3.5 py-3"
        style={{ background: palette.bg }}
      >
        <motion.div
          aria-hidden
          initial={{ scale: 0.85, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]"
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
