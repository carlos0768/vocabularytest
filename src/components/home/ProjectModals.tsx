'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui';

export function ProjectNameModal({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onConfirm(trimmedName);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-sm animate-fade-in-up">
        <h2 className="text-lg font-bold mb-4 text-center text-[var(--color-foreground)]">
          単語帳の名前
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 英語テスト対策"
            className="w-full px-4 py-3 border-2 border-[var(--color-border)] rounded-2xl text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            maxLength={50}
          />
          <div className="flex gap-3 mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              className="flex-1"
            >
              次へ
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditProjectNameModal({
  isOpen,
  onClose,
  onConfirm,
  currentName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
}) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name !== currentName) {
      onConfirm(name.trim());
    } else if (name === currentName) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="card p-6 w-full max-w-sm animate-fade-in-up">
        <h2 className="text-lg font-bold mb-4 text-center text-[var(--color-foreground)]">
          単語帳の名前を変更
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="単語帳の名前"
            className="w-full px-4 py-3 border-2 border-[var(--color-border)] rounded-2xl text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            maxLength={50}
          />
          <div className="flex gap-3 mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || name === currentName}
              className="flex-1"
            >
              変更
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ManualWordInputModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  english,
  setEnglish,
  japanese,
  setJapanese,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  english: string;
  setEnglish: (value: string) => void;
  japanese: string;
  setJapanese: (value: string) => void;
}) {
  const englishInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => englishInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (english.trim() && japanese.trim()) {
      onConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-sm animate-fade-in-up">
        <h2 className="text-lg font-bold mb-4 text-center text-[var(--color-foreground)]">
          単語を手で入力
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-muted)] mb-1.5">
                英単語
              </label>
              <input
                ref={englishInputRef}
                type="text"
                value={english}
                onChange={(e) => setEnglish(e.target.value)}
                placeholder="例: beautiful"
                className="w-full px-4 py-3 border-2 border-[var(--color-border)] rounded-2xl text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                disabled={isLoading}
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-muted)] mb-1.5">
                日本語訳
              </label>
              <input
                type="text"
                value={japanese}
                onChange={(e) => setJapanese(e.target.value)}
                placeholder="例: 美しい"
                className="w-full px-4 py-3 border-2 border-[var(--color-border)] rounded-2xl text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                disabled={isLoading}
                maxLength={100}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={!english.trim() || !japanese.trim() || isLoading}
              className="flex-1"
            >
              {isLoading ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
