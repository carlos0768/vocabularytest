'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type MobileAdSlotKind = 'inline' | 'flashcard';

type MobileInlineAdProps = {
  label: string;
  slot?: MobileAdSlotKind;
  className?: string;
  bodyClassName?: string;
};

function normalizeClientId(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('ca-pub-') ? trimmed : `ca-pub-${trimmed}`;
}

const ADSENSE_CLIENT_ID = normalizeClientId(
  process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT_ID,
);

const MOBILE_SLOT_IDS: Record<MobileAdSlotKind, string> = {
  inline: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_MOBILE_INLINE_SLOT?.trim() ?? '',
  flashcard:
    process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_FLASHCARD_SLOT?.trim() ??
    process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_MOBILE_INLINE_SLOT?.trim() ??
    '',
};

const SHOW_PLACEHOLDER =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_SHOW_PLACEHOLDERS === '1';

export function MobileInlineAd({
  label,
  slot = 'inline',
  className,
  bodyClassName,
}: MobileInlineAdProps) {
  const slotId = MOBILE_SLOT_IDS[slot];
  const adRef = useRef<HTMLModElement | null>(null);
  const pushedRef = useRef(false);
  const isConfigured = Boolean(ADSENSE_CLIENT_ID && slotId);
  const minimumHeightClass =
    slot === 'flashcard' ? 'min-h-[280px]' : 'min-h-[120px]';

  useEffect(() => {
    if (!isConfigured || !adRef.current || pushedRef.current) {
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch (error) {
      console.error(`Failed to initialize ${slot} mobile ad slot`, error);
    }
  }, [isConfigured, slot]);

  if (!isConfigured && !SHOW_PLACEHOLDER) {
    return null;
  }

  if (!isConfigured) {
    return (
      <aside
        aria-label={`${label} モバイル広告プレースホルダ`}
        className={cn(
          'rounded-[24px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-soft lg:hidden',
          className,
        )}
      >
        <div
          className={cn(
            'flex flex-col items-center justify-center text-center',
            minimumHeightClass,
            bodyClassName,
          )}
        >
          <span className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-[10px] font-semibold tracking-[0.28em] text-[var(--color-muted)]">
            AD
          </span>
          <p className="mt-4 text-sm font-bold text-[var(--color-foreground)]">
            広告
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
            {label}
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={`${label} モバイル広告`}
      className={cn(
        'rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-soft lg:hidden',
        className,
      )}
    >
      <div className={cn(minimumHeightClass, bodyClassName)}>
        <ins
          ref={adRef}
          className="adsbygoogle block h-full w-full"
          style={{ display: 'block' }}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
}
