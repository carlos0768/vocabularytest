'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface WordLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount: number;
}

export function WordLimitModal({
  isOpen,
  onClose,
  currentCount,
}: WordLimitModalProps) {
  const router = useRouter();

  const handleOrganizeWords = () => {
    onClose();
    // Navigate to first project or a word management page
    router.push('/');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <div className="p-6 text-center">
        {/* Icon */}
        <div className="w-16 h-16 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mx-auto mb-5">
          <Icon name="menu_book" size={32} className="text-[var(--color-success)]" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
          単語がいっぱいです
        </h2>

        {/* Description */}
        <p className="text-sm text-[var(--color-muted)] mb-5">
          <span className="font-medium text-[var(--color-success)]">{currentCount}語</span>の単語を保存中です。
          <br />
          これ以上保存するには、
          <br />
          既存の単語を削除するか、
          <br />
          Proにアップグレードしてください。
        </p>

        {/* Pro upgrade card */}
        <div className="bg-[var(--color-primary-light)] rounded-[var(--radius-lg)] p-4 mb-5 border border-[var(--color-border)]">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Icon name="auto_awesome" size={16} className="text-[var(--color-primary)]" />
            <span className="text-sm font-medium text-[var(--color-foreground)]">Proで無制限に学習する</span>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-3">月額 ¥500</p>
          <Link href="/subscription" onClick={onClose}>
            <Button className="w-full">
              Proにアップグレード
            </Button>
          </Link>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleOrganizeWords}
            className="flex-1 py-2.5 px-4 bg-[var(--color-border-light)] hover:bg-[var(--color-primary-light)] rounded-[var(--radius-md)] text-sm text-[var(--color-foreground)] transition-colors"
          >
            単語を整理する
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </Modal>
  );
}
