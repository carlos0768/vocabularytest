'use client';

import type { ProjectBlockType } from '@/types';

interface BlockInserterProps {
  onInsert: (type: ProjectBlockType) => void;
}

/**
 * Notion-style tap-to-write inserter.
 *
 * An invisible gap between blocks; clicking (or tapping) immediately inserts
 * a new rich text block and focuses it so the user can type right away —
 * no plus button, no popover.
 */
export function BlockInserter({ onInsert }: BlockInserterProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="ブロックを追加"
      onMouseDown={(e) => {
        // If a rich text block is currently being edited, treat the click as
        // "commit the current block" — blur it and do NOT insert a new one.
        // The user has to deliberately click again after editing ends.
        const active = document.activeElement as HTMLElement | null;
        if (active && active.isContentEditable) {
          e.preventDefault();
          active.blur();
          return;
        }
        // Use mousedown so the new block is mounted and focused before any
        // later click would steal focus.
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
