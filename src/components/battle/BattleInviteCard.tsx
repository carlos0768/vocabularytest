'use client';

/**
 * フレンド対戦の招待コード表示。
 * コードは口頭でも伝えられるよう1文字ずつ分けて大きく出す。
 * コピーは navigator.clipboard が無い環境（非 HTTPS など）もあるので握りつぶす。
 */

import { useCallback, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export function BattleInviteCard({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // クリップボードが使えない環境では表示されたコードを読んでもらう。
    }
  }, [inviteCode]);

  return (
    <div className="rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-4 shadow-[2px_3px_0_var(--solid-ink)]">
      <p className="mb-3 text-center font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        Invite Code
      </p>

      <div className="mb-3 flex justify-center gap-1.5">
        {inviteCode.split('').map((character, index) => (
          <span
            key={`${index}-${character}`}
            className="flex h-[42px] w-[30px] items-center justify-center rounded-[8px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)] font-display text-[22px] font-black text-[var(--solid-ink)]"
          >
            {character}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="flex w-full items-center justify-center gap-1.5 rounded-[10px] py-1.5 font-display text-[12px] font-bold text-[var(--color-muted)] transition-colors active:text-[var(--solid-ink)]"
      >
        <Icon name={copied ? 'check' : 'content_copy'} size={14} />
        {copied ? 'コピーしました' : 'コードをコピー'}
      </button>
    </div>
  );
}
