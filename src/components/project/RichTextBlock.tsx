'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { ProjectBlock, RichTextBlockData } from '@/types';

interface RichTextBlockProps {
  block: ProjectBlock;
  autoFocus?: boolean;
  /** Map of lowercased English headword → word id. Used to highlight
      words from the current project's word list when the block is
      in view mode. */
  wordHighlightMap?: Map<string, string>;
  onChange: (html: string) => void;
  onDelete: () => void;
  /** Callback fired when the user clicks a highlighted word. */
  onOpenWord?: (wordId: string) => void;
}

/**
 * Notion-like rich text block backed by contentEditable.
 *
 * Two modes:
 * - View: static rendering with project word highlights; clicking a
 *   highlighted span opens the word detail modal, clicking elsewhere
 *   enters edit mode.
 * - Edit: contentEditable with a floating formatting toolbar.
 */
export function RichTextBlock({
  block,
  autoFocus,
  wordHighlightMap,
  onChange,
  onDelete,
  onOpenWord,
}: RichTextBlockProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'view' | 'edit'>(autoFocus ? 'edit' : 'view');
  // We mirror the canonical HTML in local state so view mode updates
  // immediately on blur without waiting for the parent's prop round-trip.
  const [html, setHtml] = useState<string>((block.data as RichTextBlockData)?.html ?? '');

  // When the block prop changes from the parent (e.g. due to a remote
  // sync), refresh the local mirror unless we are actively editing.
  useEffect(() => {
    if (mode !== 'edit') {
      const nextHtml = (block.data as RichTextBlockData)?.html ?? '';
      setHtml(nextHtml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id, (block.data as RichTextBlockData)?.html]);

  // On entering edit mode, seed the editable div with current HTML and
  // focus it. Caret is moved to the end for a natural typing experience.
  useEffect(() => {
    if (mode !== 'edit' || !editorRef.current) return;
    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
    editorRef.current.focus();
    if (autoFocus) {
      editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const range = document.createRange();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const handleBlur = () => {
    const nextHtml = sanitizeRichTextHtml(editorRef.current?.innerHTML ?? '');
    setHtml(nextHtml);
    setMode('view');
    onChange(nextHtml);
  };

  const highlightedHtml = useMemo(
    () => (wordHighlightMap && wordHighlightMap.size > 0 ? highlightWordsInHtml(html, wordHighlightMap) : html),
    [html, wordHighlightMap],
  );

  const handleViewMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target) {
      const span = target.closest('[data-merken-word-id]');
      if (span) {
        // Clicked a highlighted word → open the word modal, do NOT enter edit mode.
        e.preventDefault();
        e.stopPropagation();
        const wid = span.getAttribute('data-merken-word-id');
        if (wid && onOpenWord) onOpenWord(wid);
        return;
      }
    }
    // Otherwise, switch to edit mode. Prevent the default mousedown so
    // the incoming click doesn't steal the caret placement; the effect
    // that runs after mode change will focus the editor and place the
    // caret at the end.
    e.preventDefault();
    setMode('edit');
  };

  return (
    <div className="group relative lg:pl-7">
      {/* Floating toolbar shown while the editor has focus. */}
      {mode === 'edit' && (
        <div className="absolute -top-9 left-0 z-10 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-sm lg:left-7">
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

      {mode === 'edit' ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="本文を入力..."
          className="rich-text-block text-[var(--color-foreground)] outline-none"
          onBlur={handleBlur}
        />
      ) : (
        <div
          role="textbox"
          aria-label="リッチテキストブロック"
          tabIndex={0}
          data-placeholder="本文を入力..."
          className="rich-text-block cursor-text text-[var(--color-foreground)] outline-none"
          onMouseDown={handleViewMouseDown}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setMode('edit');
            }
          }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      )}

      {/* Delete handle — always mounted inside the group, toggled via CSS so
          moving the pointer onto it doesn't exit the hover area. */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onDelete();
        }}
        aria-label="ブロックを削除"
        className="absolute left-0 top-0 hidden h-6 w-6 items-center justify-center rounded text-[var(--color-muted)] opacity-0 transition-opacity hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)] group-hover:opacity-100 lg:flex"
      >
        <Icon name="close" size={14} />
      </button>
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
 * the toolbar. Strips script, style, event handlers, and unknown tags. Also
 * strips our own highlight spans — highlights are re-applied on every render
 * from the canonical stored text.
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

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Walk an HTML string and wrap any plain-text occurrence of a known word
 * in `<span class="merken-highlighted-word" data-merken-word-id="...">`.
 * Matching is case-insensitive and respects word boundaries. Longer words
 * are matched first so "ice cream" wins over "ice".
 */
export function highlightWordsInHtml(
  html: string,
  wordMap: Map<string, string>,
): string {
  if (typeof window === 'undefined' || wordMap.size === 0) return html;
  const keys = [...wordMap.keys()]
    .filter((k) => k.length > 0)
    .sort((a, b) => b.length - a.length);
  if (keys.length === 0) return html;
  // \b is a word boundary (transition between [A-Za-z0-9_] and anything
  // else). Combined with the `i` flag, this matches "hello" inside "Hello"
  // even when the word in the project list is lowercased and the text
  // capitalizes it at the start of a sentence. We deliberately avoid
  // lookbehind assertions for broader browser support (older Safari).
  const pattern = new RegExp(
    `\\b(${keys.map(escapeRegExp).join('|')})\\b`,
    'gi',
  );

  const template = document.createElement('template');
  template.innerHTML = html;

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text) return;
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      const pieces: Node[] = [];
      let lastIdx = 0;
      let hit = false;
      while ((match = pattern.exec(text)) !== null) {
        hit = true;
        const start = match.index;
        const end = start + match[0].length;
        if (start > lastIdx) {
          pieces.push(document.createTextNode(text.slice(lastIdx, start)));
        }
        // match[0] preserves original casing from the text (e.g. "Hello"),
        // while wordMap keys are stored lowercased. Look up case-insensitively.
        const wid = wordMap.get(match[0].toLowerCase());
        if (wid) {
          const span = document.createElement('span');
          span.className = 'merken-highlighted-word';
          span.setAttribute('data-merken-word-id', wid);
          span.textContent = match[0];
          pieces.push(span);
        } else {
          pieces.push(document.createTextNode(match[0]));
        }
        lastIdx = end;
      }
      if (!hit) return;
      if (lastIdx < text.length) {
        pieces.push(document.createTextNode(text.slice(lastIdx)));
      }
      const frag = document.createDocumentFragment();
      for (const p of pieces) frag.appendChild(p);
      node.parentNode?.replaceChild(frag, node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      if (el.classList?.contains('merken-highlighted-word')) return;
      for (const child of Array.from(el.childNodes)) {
        walk(child);
      }
    }
  };

  for (const child of Array.from(template.content.childNodes)) {
    walk(child);
  }

  // escapeHtml is referenced elsewhere for safety nets but not directly
  // needed here since DOM nodes are built via the DOM API.
  void escapeHtml;

  return template.innerHTML;
}
