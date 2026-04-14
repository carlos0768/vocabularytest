'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { ProjectBlockType } from '@/types';

interface BlockInserterProps {
  onInsert: (type: ProjectBlockType) => void;
}

/**
 * Click-to-reveal block inserter (Notion-like caret UX).
 *
 * Idle state: a thin hover zone that expands on mouse hover.
 * Clicked state: shows a vertical caret and a "テンプレートを選択" button.
 * Button opens a popover with the available block templates.
 */
export function BlockInserter({ onInsert }: BlockInserterProps) {
  const [open, setOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !popoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPopoverOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, popoverOpen]);

  const handleSelect = (type: ProjectBlockType) => {
    onInsert(type);
    setOpen(false);
    setPopoverOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Idle hover zone (click to activate). */}
      {!open ? (
        <button
          type="button"
          aria-label="ブロックを挿入"
          onClick={() => setOpen(true)}
          className="group block h-4 w-full cursor-text transition-colors hover:bg-[var(--color-surface-secondary)]/40"
        >
          <span className="block h-px w-full bg-transparent transition-colors group-hover:bg-[var(--color-border-light)]" />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1">
          {/* Vertical caret */}
          <span className="inline-block h-5 w-px animate-pulse bg-[var(--color-foreground)]" />
          {/* Template picker trigger */}
          <button
            type="button"
            onClick={() => setPopoverOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-muted)] shadow-sm hover:text-[var(--color-foreground)]"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-gradient-to-br from-[#f5b638] to-[#2f6ee3] text-[8px] text-white"
            >
              ●
            </span>
            テンプレートを選択
            <Icon name="expand_more" size={14} />
          </button>
        </div>
      )}

      {/* Template popover */}
      {popoverOpen && (
        <div className="absolute left-16 top-8 z-20 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg">
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
      onClick={onClick}
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
