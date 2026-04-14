'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type DesktopAdSlotSide = 'left' | 'right';

type DesktopAdSlotProps = {
  side: DesktopAdSlotSide;
  label: string;
  className?: string;
};

function normalizeClientId(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('ca-pub-') ? trimmed : `ca-pub-${trimmed}`;
}

const ADSENSE_CLIENT_ID = normalizeClientId(
  process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT_ID,
);
const DESKTOP_SLOT_IDS: Record<DesktopAdSlotSide, string> = {
  left: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_DESKTOP_LEFT_SLOT?.trim() ?? '',
  right: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_DESKTOP_RIGHT_SLOT?.trim() ?? '',
};
const SHOW_PLACEHOLDER =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_SHOW_PLACEHOLDERS === '1';

export function DesktopAdSlot({
  side,
  label,
  className,
}: DesktopAdSlotProps) {
  const slotId = DESKTOP_SLOT_IDS[side];
  const adRef = useRef<HTMLModElement | null>(null);
  const pushedRef = useRef(false);
  const isConfigured = Boolean(ADSENSE_CLIENT_ID && slotId);
  const sideLabel = side === 'left' ? '左' : '右';

  useEffect(() => {
    if (!isConfigured || !adRef.current || pushedRef.current) {
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch (error) {
      console.error(`Failed to initialize desktop ${side} ad slot`, error);
    }
  }, [isConfigured, side]);

  if (!isConfigured && !SHOW_PLACEHOLDER) {
    return null;
  }

  if (!isConfigured) {
    return (
      <aside
        aria-label={`${label} ${sideLabel}広告プレースホルダ`}
        className={cn(
          'flex h-[600px] w-[160px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center shadow-soft',
          className,
        )}
      >
        <span className="rounded-full bg-[var(--color-surface-secondary)] px-2.5 py-1 text-[10px] font-semibold tracking-[0.28em] text-[var(--color-muted)]">
          AD
        </span>
        <p className="mt-4 text-sm font-bold text-[var(--color-foreground)]">広告</p>
        <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
          {label}
          <br />
          {sideLabel}レール
        </p>
        <p className="mt-4 text-[11px] text-[var(--color-muted)]">160 x 600</p>
      </aside>
    );
  }

  return (
    <aside
      aria-label={`${label} ${sideLabel}広告`}
      className={cn(
        'h-[600px] w-[160px] overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-soft',
        className,
      )}
    >
      <ins
        ref={adRef}
        className="adsbygoogle block"
        style={{ display: 'block', width: '160px', height: '600px' }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-format="rectangle"
        data-ad-slot={slotId}
        data-full-width-responsive="false"
      />
    </aside>
  );
}
