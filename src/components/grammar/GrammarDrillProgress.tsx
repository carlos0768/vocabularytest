'use client';

import { Icon } from '@/components/ui/Icon';

interface GrammarDrillProgressProps {
  current: number;
  total: number;
  onClose: () => void;
}

export function GrammarDrillProgress({ current, total, onClose }: GrammarDrillProgressProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={onClose}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--color-surface-secondary)] transition-colors shrink-0"
      >
        <Icon name="close" size={20} className="text-[var(--color-muted)]" />
      </button>
      <div className="flex-1 h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-sm font-bold text-[var(--color-muted)] shrink-0 tabular-nums">
        {current}/{total}
      </span>
    </div>
  );
}
