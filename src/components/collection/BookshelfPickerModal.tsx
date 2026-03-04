'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import type { Collection } from '@/types';

interface BookshelfPickerModalProps {
  isOpen: boolean;
  collections: Collection[];
  loading: boolean;
  onSelect: (collectionId: string) => void;
  onCreate: (name: string) => void;
  onSkip: () => void;
}

export function BookshelfPickerModal({
  isOpen,
  collections,
  loading,
  onSelect,
  onCreate,
  onSkip,
}: BookshelfPickerModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewName('');
    setIsCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div
        className="bg-[var(--color-surface)] w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--color-border-light)]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--color-foreground)]">
              本棚に追加
            </h3>
            <button
              onClick={onSkip}
              className="p-1.5 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
            >
              <Icon name="close" size={20} className="text-[var(--color-muted)]" />
            </button>
          </div>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            単語帳を整理する本棚を選んでください
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {collections.map((col) => (
                <button
                  key={col.id}
                  onClick={() => onSelect(col.id)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--color-primary-light)] transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center shrink-0">
                    <Icon name="library_books" size={20} className="text-[var(--color-primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--color-foreground)] truncate">
                      {col.name}
                    </p>
                    {col.description && (
                      <p className="text-xs text-[var(--color-muted)] truncate mt-0.5">
                        {col.description}
                      </p>
                    )}
                  </div>
                  <Icon name="chevron_right" size={20} className="text-[var(--color-muted)] shrink-0" />
                </button>
              ))}

              {/* Create new */}
              {isCreating ? (
                <div className="px-3 py-3 rounded-xl bg-[var(--color-primary-light)]">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    placeholder="本棚の名前"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none text-sm bg-[var(--color-surface)]"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setIsCreating(false); setNewName(''); }}
                      className="flex-1"
                    >
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreate}
                      disabled={!newName.trim()}
                      className="flex-1"
                    >
                      作成
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--color-primary-light)] transition-colors text-left border-2 border-dashed border-[var(--color-border)]"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-background)] flex items-center justify-center shrink-0 border border-[var(--color-border)]">
                    <Icon name="add" size={20} className="text-[var(--color-primary)]" />
                  </div>
                  <p className="font-medium text-[var(--color-primary)]">
                    新しい本棚を作成
                  </p>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--color-border-light)]">
          <Button
            variant="secondary"
            onClick={onSkip}
            className="w-full"
          >
            スキップ
          </Button>
        </div>
      </div>
    </div>
  );
}
