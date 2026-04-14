'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { ProjectBlockType } from '@/types';

interface BlockInserterProps {
  onInsert: (type: ProjectBlockType) => void;
}

/**
 * Notion-like inline "+" inserter between blocks.
 *
 * Idle: thin hover zone with a centered "+" button that fades in on hover
 *       (always discoverable, low visual noise).
 * Clicked: opens a popover with the available block templates.
 */
export function BlockInserter({ onInsert }: BlockInserterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleSelect = (type: ProjectBlockType) => {
    onInsert(type);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative group/inserter flex items-center py-1">
      {/* Inline "+" trigger (Notion-style) — always visible but subtle */}
      <button
        type="button"
        aria-label="ブロックを追加"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`flex h-5 items-center gap-1.5 px-2 text-[0.7rem] transition-colors ${
          open
            ? 'text-[var(--color-foreground)]'
            : 'text-[var(--color-muted)]/50 hover:text-[var(--color-foreground)]'
        }`}
      >
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-gradient-to-br from-[#f5b638] to-[#2f6ee3] text-[9px] font-bold text-white"
        >
          +
        </span>
        <span className="hidden group-hover/inserter:inline">テンプレートを選択</span>
      </button>
      <span className="ml-1 h-px flex-1 bg-transparent transition-colors group-hover/inserter:bg-[var(--color-border-light)]" />

      {/* Template popover */}
      {open && (
        <div className="absolute left-0 top-7 z-30 w-60 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg">
          <p className="px-2 pt-1.5 pb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            ブロックを追加
          </p>
          <PopoverItem
            icon="notes"
            label="リッチテキスト"
            description="見出し・リスト・太字"
            onClick={() => handleSelect('richText')}
          />
          <PopoverItem
            icon="table"
            label="データベース"
            description="近日公開"
            disabled
          />
        </div>
      )}
    </div>
  );
}

function PopoverItem({
  icon,
  label,
  description,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  description: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => {
        // Use mousedown so the selection commits before any blur-triggered
        // re-render can interfere with the click. Also stop propagation so
        // the click-outside listener (also on mousedown) doesn't fire first.
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onClick?.();
      }}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-xs transition-colors enabled:hover:bg-[var(--color-surface-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-surface-secondary)] text-[var(--color-muted)]">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex flex-col">
        <span className="font-semibold text-[var(--color-foreground)]">{label}</span>
        <span className="text-[0.7rem] text-[var(--color-muted)]">{description}</span>
      </span>
    </button>
  );
}
