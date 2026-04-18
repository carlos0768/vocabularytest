'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BlockTypeMenu, type BlockTypeOption } from './BlockTypeMenu';
import type { ProjectBlockType } from '@/types';

interface BlockInserterProps {
  onInsert: (type: ProjectBlockType) => void;
  /**
   * - `gap` (default): invisible tap-target between blocks. A click creates
   *   a rich text block immediately, matching the original Notion-style
   *   "click to write" behaviour.
   * - `visible`: a labelled "+ ブロックを追加" button. Opens a picker so
   *   the user can choose between rich text and grammar list.
   */
  variant?: 'gap' | 'visible';
  /** Custom option set for the picker (only used when `variant === 'visible'`). */
  menuOptions?: BlockTypeOption[];
}

/**
 * Notion-style block inserter.
 */
export function BlockInserter({ onInsert, variant = 'gap', menuOptions }: BlockInserterProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (variant === 'visible') {
    return (
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => {
            // Blur any active contentEditable so a subsequent block insert
            // can take focus cleanly.
            const active = document.activeElement as HTMLElement | null;
            if (active && active.isContentEditable) active.blur();
            e.preventDefault();
            setMenuOpen((v) => !v);
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-transparent px-3 py-2 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-primary)]/40 hover:text-[var(--color-foreground)]"
        >
          <Icon name="add" size={16} />
          ブロックを追加
        </button>
        <BlockTypeMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onPick={(type) => {
            setMenuOpen(false);
            onInsert(type);
          }}
          options={menuOptions}
        />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="ブロックを追加"
      onMouseDown={(e) => {
        // If a rich text block is currently being edited, treat the click as
        // "commit the current block" — blur it and do NOT insert a new one.
        const active = document.activeElement as HTMLElement | null;
        if (active && active.isContentEditable) {
          e.preventDefault();
          active.blur();
          return;
        }
        e.preventDefault();
        onInsert('richText');
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const active = document.activeElement as HTMLElement | null;
        if (active && active.isContentEditable) {
          e.preventDefault();
          active.blur();
          return;
        }
        e.preventDefault();
        onInsert('richText');
      }}
      className="h-8 w-full cursor-text"
    />
  );
}
