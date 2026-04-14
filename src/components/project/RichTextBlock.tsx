'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { ProjectBlock, RichTextBlockData } from '@/types';

interface RichTextBlockProps {
  block: ProjectBlock;
  autoFocus?: boolean;
  onChange: (html: string) => void;
  onDelete: () => void;
}

/**
 * Simple Notion-like rich text block backed by contentEditable.
 * Supports H2 / body / bullet list / bold via document.execCommand.
 * Content is sanitized via a conservative tag whitelist on save.
 */
export function RichTextBlock({ block, autoFocus, onChange, onDelete }: RichTextBlockProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);

  const initialHtml = (block.data as RichTextBlockData)?.html ?? '';

  // Set initial content once on mount. Afterwards we avoid re-syncing the
  // DOM to keep the caret stable while the user types.
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== initialHtml) {
      editorRef.current.innerHTML = initialHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
      editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Move caret to the end
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [autoFocus]);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const handleBlur = () => {
    setFocused(false);
    const html = editorRef.current?.innerHTML ?? '';
    onChange(sanitizeRichTextHtml(html));
  };

  return (
    <div
      className="group relative my-1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Floating toolbar shown while the editor has focus. */}
      {focused && (
        <div className="absolute -top-9 left-0 z-10 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-sm">
          <ToolbarButton label="見出し" onClick={() => exec('formatBlock', '<h2>')}>
            <Icon name="title" size={16} />
          </ToolbarButton>
          <ToolbarButton label="本文" onClick={() => exec('formatBlock', '<p>')}>
            <Icon name="notes" size={16} />
          </ToolbarButton>
          <ToolbarButton label="リスト" onClick={() => exec('insertUnorderedList')}>
            <Icon name="format_list_bulleted" size={16} />
          </ToolbarButton>
          <ToolbarButton label="太字" onClick={() => exec('bold')}>
            <Icon name="format_bold" size={16} />
          </ToolbarButton>
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="本文を入力..."
        className="rich-text-block min-h-[2rem] rounded-md px-3 py-2 text-[var(--color-foreground)] outline-none focus:bg-[var(--color-surface-secondary)]"
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
      />

      {/* Delete handle (hover only) */}
      {hover && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="ブロックを削除"
          className="absolute -left-7 top-1 hidden h-6 w-6 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)] lg:flex"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      // mousedown fires before the editor's blur, so the selection is
      // preserved when the command runs.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
    >
      {children}
    </button>
  );
}

/**
 * Conservative HTML sanitizer that keeps only block/inline tags we expose in
 * the toolbar. Strips script, style, event handlers, and unknown tags.
 */
export function sanitizeRichTextHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  const allowedTags = new Set([
    'P',
    'DIV',
    'BR',
    'H1',
    'H2',
    'H3',
    'UL',
    'OL',
    'LI',
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'SPAN',
  ]);

  const template = document.createElement('template');
  template.innerHTML = html;

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (!allowedTags.has(el.tagName)) {
          // Replace disallowed element with its text content.
          const text = document.createTextNode(el.textContent ?? '');
          el.replaceWith(text);
          continue;
        }
        // Strip all attributes (including on* handlers, style, href, etc.)
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        walk(el);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
      }
    }
  };

  walk(template.content);
  return template.innerHTML;
}
