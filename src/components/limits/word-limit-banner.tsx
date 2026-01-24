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
    <div className="bg-amber-50 border-b border-amber-100">
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 flex-1">
          単語数が残り<span className="font-medium">{remaining}語</span>です
        </p>
        <Link
          href="/subscription"
          className="flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-900 shrink-0"
        >
          Proで無制限に
          <ChevronRight className="w-4 h-4" />
        </Link>
        <button
          onClick={handleDismiss}
          className="p-1 text-amber-500 hover:text-amber-700 transition-colors"
          aria-label="閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
