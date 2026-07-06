'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { InsufficientCoinsInfo } from '@/lib/coins/errors';
import { MONTHLY_COIN_ALLOWANCE } from '@/lib/coins/rates';

interface InsufficientCoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  coinInfo: InsufficientCoinsInfo | null;
}

export function InsufficientCoinsModal({
  isOpen,
  onClose,
  coinInfo,
}: InsufficientCoinsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <div className="p-6 text-center">
        <div className="w-16 h-16 bg-[var(--color-primary-light)] rounded-full flex items-center justify-center mx-auto mb-5">
          <Icon name="toll" size={32} className="text-[var(--color-primary)]" />
        </div>

        <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
          コインが不足しています
        </h2>

        {coinInfo && (
          <p className="text-sm text-[var(--color-muted)] mb-4">
            必要: <span className="font-medium text-[var(--color-foreground)]">{coinInfo.cost}枚</span>
            {' / '}
            残り: <span className="font-medium text-[var(--color-foreground)]">{coinInfo.totalRemaining}枚</span>
          </p>
        )}

        <div className="bg-[var(--color-primary-light)] rounded-[var(--radius-lg)] p-4 mb-5 border border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-muted)] mb-3">
            毎月{MONTHLY_COIN_ALLOWANCE}枚が自動付与されます（翌月1日リセット・繰り越しなし）
          </p>
          <Link href="/coins" onClick={onClose}>
            <Button className="w-full">コインを購入</Button>
          </Link>
        </div>

        <button
          onClick={onClose}
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors py-2 px-4"
        >
          閉じる
        </button>
      </div>
    </Modal>
  );
}
