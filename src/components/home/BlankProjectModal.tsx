'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';

interface BlankProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, description?: string) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function BlankProjectModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
}: BlankProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => {
        setName('');
        setDescription('');
        nameInputRef.current?.focus();
      }, 80);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedDescription = description.trim();
    void onConfirm(trimmedName, trimmedDescription.length > 0 ? trimmedDescription : undefined);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0"
      onClick={onClose}
    >
      {/* Bottom sheet */}
      <div
        className="relative w-full max-w-md animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-background)',
          borderRadius: '20px 20px 0 0',
          border: '1.25px solid var(--solid-ink)',
          borderBottom: 'none',
          boxShadow: '0 -4px 0 var(--solid-ink)',
          padding: '0 0 max(1.5rem, env(safe-area-inset-bottom))',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-[var(--color-border)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              NEW
            </div>
            <div className="mt-0.5 font-display text-[20px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">
              新しい単語帳
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border-[1.25px] border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-muted)]"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5">
          {/* Name field */}
          <div className="mb-3">
            <div className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
              単語帳名
            </div>
            <div
              className="relative overflow-hidden rounded-[10px] border-[1.25px] border-[var(--solid-ink)]"
              style={{ boxShadow: '2px 2px 0 var(--solid-ink)' }}
            >
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 英検準2級"
                maxLength={50}
                className="w-full bg-white px-3 py-3 text-[14px] font-medium text-[var(--solid-ink)] placeholder:text-[var(--color-muted)] focus:outline-none"
              />
            </div>
          </div>

          {/* Description field */}
          <div className="mb-5">
            <div className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
              メモ <span className="normal-case tracking-normal text-[var(--color-muted)] opacity-70">（任意）</span>
            </div>
            <div
              className="relative overflow-hidden rounded-[10px] border-[1.25px] border-[var(--solid-ink)]"
              style={{ boxShadow: '2px 2px 0 var(--solid-ink)' }}
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="この単語帳の目的やメモ"
                rows={2}
                maxLength={300}
                className="w-full resize-none bg-white px-3 py-3 text-[13px] text-[var(--solid-ink)] placeholder:text-[var(--color-muted)] focus:outline-none"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] py-3 font-display text-[13px] font-bold text-[var(--solid-ink)] transition-all active:opacity-70 disabled:opacity-50"
            >
              キャンセル
            </button>
            <SolidButton
              type="submit"
              variant="inverse"
              size="md"
              disabled={!name.trim() || isSubmitting}
              className="flex-1"
              faceClassName="!w-full !justify-center"
            >
              {isSubmitting ? '作成中...' : '作成'}
            </SolidButton>
          </div>
        </form>
      </div>
    </div>
  );
}
