'use client';

/**
 * 降参の確認ダイアログ。早押し中の誤タップで対戦が終わらないよう、
 * 退出は必ずここを通す。
 */

import { Modal } from '@/components/ui/modal';
import { Icon } from '@/components/ui/Icon';

export function BattleLeaveConfirm({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <div className="p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-error-light)]">
          <Icon name="flag" size={22} className="text-[var(--color-error)]" />
        </div>
        <h3 className="font-display text-[16px] font-black text-[var(--solid-ink)]">降参しますか？</h3>
        <p className="mt-2 text-[13px] leading-[1.7] text-[var(--color-muted)]">
          途中で退出すると、この対戦は相手の勝ちになります。
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[14px] font-bold text-[var(--solid-ink)]"
          >
            続ける
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-11 flex-1 rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-error)] font-display text-[14px] font-bold text-white"
          >
            降参する
          </button>
        </div>
      </div>
    </Modal>
  );
}
