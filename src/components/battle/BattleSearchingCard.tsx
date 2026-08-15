'use client';

/**
 * ランダムマッチの待機カード。待ち時間が読めない画面なので、経過秒を出して
 * 「止まっていない」ことが分かるようにしている。
 */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BattlePulse } from '@/components/battle/BattlePulse';

function formatElapsed(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

export function BattleSearchingCard({ onCancel }: { onCancel: () => void }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative flex h-[124px] w-[124px] items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full border-2 border-[var(--color-accent)] opacity-40" />
        <span className="flex h-[92px] w-[92px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-white shadow-[2px_3px_0_var(--solid-ink)]">
          <Icon name="swords" size={38} />
        </span>
      </div>

      <div className="text-center">
        <h2 className="font-display text-[20px] font-black text-[var(--solid-ink)]">
          対戦相手を探しています
        </h2>
        <p className="mt-2 text-[12.5px] leading-[1.8] text-[var(--color-muted)]">
          見つかり次第、自動で対戦が始まります。
          <br />
          このまま少しお待ちください。
        </p>
        <p className="mt-3 font-mono text-[13px] font-bold tabular-nums text-[var(--solid-ink)]">
          {formatElapsed(elapsedSeconds)}
        </p>
      </div>

      <BattlePulse label="マッチング中" />

      <button
        type="button"
        onClick={onCancel}
        className="flex h-[46px] w-full items-center justify-center rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[14px] font-bold text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]"
      >
        キャンセル
      </button>
    </div>
  );
}
