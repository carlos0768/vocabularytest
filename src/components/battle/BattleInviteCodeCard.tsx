'use client';

/**
 * フレンド対戦のホスト待機カード。招待コードを大きく見せ、共有 (Web Share API)
 * とコピーで相手に渡せるようにする。相手が入室すると呼び出し側がページを移す。
 */

import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/toast';
import { BattlePulse } from '@/components/battle/BattlePulse';

export function BattleInviteCodeCard({
  inviteCode,
  onCancel,
}: {
  inviteCode: string;
  onCancel: () => void;
}) {
  const { showToast } = useToast();

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      showToast({ message: '招待コードをコピーしました', type: 'success' });
    } catch {
      showToast({ message: 'コピーできませんでした', type: 'error' });
    }
  };

  const shareCode = async () => {
    const text = `MERKENの単語対戦に参加してね！ 招待コード: ${inviteCode}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // ユーザーがシェアシートを閉じただけのことが多いのでコピーに落とす
      }
    }
    void copyCode();
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="w-full rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-6 text-center shadow-[2px_3px_0_var(--solid-ink)]">
        <p className="font-mono text-[10px] font-bold tracking-[0.1em] text-[var(--color-muted)]">
          INVITE CODE
        </p>
        <p className="mt-3 font-mono text-[38px] font-black leading-none tracking-[0.16em] text-[var(--solid-ink)]">
          {inviteCode}
        </p>
        <p className="mt-4 text-[12.5px] leading-[1.8] text-[var(--color-muted)]">
          このコードを相手に伝えてください。
          <br />
          参加した瞬間に自動で対戦が始まります。
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={shareCode}
            className="flex h-[46px] flex-1 items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[14px] font-bold text-[var(--color-surface)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="ios_share" size={16} />
            共有する
          </button>
          <button
            type="button"
            onClick={copyCode}
            aria-label="招待コードをコピー"
            className="flex h-[46px] w-[52px] shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="content_copy" size={16} />
          </button>
        </div>
      </div>

      <BattlePulse label="相手の参加を待っています" />

      <button
        type="button"
        onClick={onCancel}
        className="text-[13px] font-bold text-[var(--color-muted)] underline underline-offset-4"
      >
        キャンセル
      </button>
    </div>
  );
}
