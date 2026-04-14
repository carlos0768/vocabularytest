'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

interface BlankProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, description?: string) => void | Promise<void>;
  isSubmitting?: boolean;
}

/**
 * Lightweight creation modal used by the bottom-nav FAB. Unlike the
 * full ProjectNameModal (which also handles icon upload and is used in
 * the scan flow), this one only collects a name and optional description
 * so the user gets a quick "from-blank" creation experience.
 */
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
      setName('');
      setDescription('');
      setTimeout(() => nameInputRef.current?.focus(), 80);
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6 shadow-2xl animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-center text-lg font-bold text-[var(--color-foreground)]">
          新しい単語帳
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-[var(--color-muted)]">
              名前
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 英語テスト対策"
              maxLength={50}
              className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base text-[var(--color-foreground)] transition-colors focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-[var(--color-muted)]">
              説明 <span className="text-xs text-[var(--color-muted)]">(任意)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="この単語帳の目的やメモ"
              rows={3}
              maxLength={300}
              className="w-full resize-none rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-foreground)] transition-colors focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? '作成中...' : '作成'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
