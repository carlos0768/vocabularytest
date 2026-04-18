'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { ProjectBlockType } from '@/types';

export interface BlockTypeOption {
  type: ProjectBlockType;
  label: string;
  description: string;
  iconName: string;
}

const DEFAULT_OPTIONS: BlockTypeOption[] = [
  {
    type: 'richText',
    label: '本文',
    description: '英語長文や自由記述',
    iconName: 'notes',
  },
  {
    type: 'grammarList',
    label: '文法リスト',
    description: '文法ルールを行＋展開で整理',
    iconName: 'table_chart',
  },
];

interface BlockTypeMenuProps {
  open: boolean;
  onPick: (type: ProjectBlockType) => void;
  onClose: () => void;
  options?: BlockTypeOption[];
}

export function BlockTypeMenu({ open, onPick, onClose, options = DEFAULT_OPTIONS }: BlockTypeMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="menu"
      className="absolute z-30 mt-1 w-64 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
    >
      <ul className="py-1">
        {options.map((opt) => (
          <li key={opt.type}>
            <button
              type="button"
              role="menuitem"
              onMouseDown={(e) => {
                // Blur any active contentEditable so the newly-inserted block
                // can take focus.
                const active = document.activeElement as HTMLElement | null;
                if (active && active.isContentEditable) active.blur();
                e.preventDefault();
                onPick(opt.type);
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-secondary)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-surface-secondary)] text-[var(--color-muted)]">
                <Icon name={opt.iconName} size={18} />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-[var(--color-foreground)]">{opt.label}</span>
                <span className="text-xs text-[var(--color-muted)]">{opt.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
