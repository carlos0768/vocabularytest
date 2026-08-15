'use client';

/**
 * 待機中インジケータ。3つのドットが順に光る、対戦系の共通パーツ。
 * (相手待ち・マッチング中・問題準備中で使い回す)
 */

import { cn } from '@/lib/utils';

export function BattlePulse({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2.5', className)} role="status">
      <span className="flex items-end gap-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-2.5 w-2.5 animate-bounce rounded-full bg-[var(--color-accent)]"
            style={{ animationDelay: `${index * 140}ms`, animationDuration: '900ms' }}
          />
        ))}
      </span>
      <span className="text-[12.5px] font-bold text-[var(--color-muted)]">{label}</span>
    </div>
  );
}
