'use client';

import { useEffect, ReactNode } from 'react';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  variant?: 'center' | 'sheet';
}

export function Modal({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true,
  closeOnBackdrop = true,
  variant = 'center',
}: ModalProps) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isSheet = variant === 'sheet';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center p-4'
      )}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 animate-fade-in" />

      {/* Modal content — animated with the same fade-in-up as the word list
          sort / filter bottom sheets so the transition feels consistent. */}
      <div
        className={cn(
          'relative bg-[var(--color-surface)] shadow-2xl border border-[var(--color-border)] animate-fade-in-up',
          isSheet
            ? 'w-full max-w-md max-h-[80dvh] rounded-2xl flex flex-col'
            : 'w-full max-w-sm rounded-[var(--radius-xl)]',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-1 text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
            aria-label="閉じる"
          >
            <Icon name="close" size={20} />
          </button>
        )}
        {isSheet ? (
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
