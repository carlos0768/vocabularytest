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
        'fixed inset-0 z-[100] flex justify-center',
        isSheet ? 'items-end md:items-center md:p-4' : 'items-center p-4'
      )}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-300 ease-out" />

      {/* Modal content */}
      <div
        className={cn(
          'relative bg-[var(--color-surface)] shadow-2xl border border-[var(--color-border)]',
          isSheet
            ? 'w-full max-w-lg max-h-[85dvh] rounded-t-2xl md:rounded-2xl md:max-w-md md:max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-400 ease-out md:slide-in-from-bottom-0 md:zoom-in-95'
            : 'w-full max-w-sm rounded-[var(--radius-xl)] animate-in fade-in zoom-in-95 duration-300 ease-out',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {isSheet && (
          <div
            aria-hidden="true"
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--color-border)] md:hidden"
          />
        )}
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
          <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] md:pb-0">
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
