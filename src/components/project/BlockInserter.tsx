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
        // Use mousedown so the new block is mounted and focused before any
        // later click would steal focus.
        e.preventDefault();
        onInsert('richText');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onInsert('richText');
        }
      }}
      className="group/inserter h-4 w-full cursor-text"
    >
      <span className="block h-px w-full bg-transparent transition-colors group-hover/inserter:bg-[var(--color-border-light)]" />
    </div>
  );
}
