'use client';

import Link from 'next/link';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { FREE_WORD_LIMIT } from '@/lib/utils';

interface WordLimitBannerProps {
  currentCount: number;
  onDismiss?: () => void;
}

export function WordLimitBanner({ currentCount, onDismiss }: WordLimitBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const remaining = FREE_WORD_LIMIT - currentCount;

  // Don't show if not near limit or already dismissed
  if (remaining > 5 || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="bg-[var(--color-warning-light)] border-b border-[var(--color-border)]">
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-[var(--color-warning)] shrink-0" />
        <p className="text-sm text-[var(--color-foreground)] flex-1">
          単語数が残り<span className="font-medium">{remaining}語</span>です
        </p>
        <Link
          href="/subscription"
          className="flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] shrink-0"
        >
          Proで無制限に
          <ChevronRight className="w-4 h-4" />
        </Link>
        <button
          onClick={handleDismiss}
          className="p-1 text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          aria-label="閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
