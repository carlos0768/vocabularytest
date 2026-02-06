'use client';

import { Modal } from './modal';
import { Button } from './button';
import { Icon } from './Icon';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  confirmLabel?: string;
  isLoading?: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = '削除',
  isLoading = false,
}: DeleteConfirmModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false} closeOnBackdrop={!isLoading}>
      <div className="p-6">
        <div className="flex items-center justify-center w-12 h-12 bg-[var(--color-error-light)] rounded-full mx-auto mb-4">
          <Icon name="warning" size={24} className="text-[var(--color-error)]" />
        </div>

        <h3 className="text-lg font-semibold text-center text-[var(--color-foreground)] mb-2">
          {title}
        </h3>

        <p className="text-sm text-[var(--color-muted)] text-center mb-6">
          {message}
        </p>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={isLoading}
          >
            キャンセル
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Icon name="progress_activity" size={16} className="mr-2 animate-spin" />
                削除中...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
