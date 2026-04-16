'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  filterCandidatesForAi,
  type PassageMatchCandidate,
  type PassageWordMatch,
} from '@/lib/ai/match-passage-words';
import type { CachedPassageMatch, ProjectBlock, RichTextBlockData } from '@/types';

interface RichTextBlockProps {
  block: ProjectBlock;
  autoFocus?: boolean;
  /** Map of lowercased English headword → word id. Used to highlight
      words from the current project's word list when the block is
      in view mode. */
  wordHighlightMap?: Map<string, string>;
  /**
   * Vocabulary list passed to the AI passage-matching API so that
   * inflected verbs, idioms, and templatic expressions like
   * "any other ~ than A" can be highlighted in addition to the exact
   * regex matches built from `wordHighlightMap`. When omitted (or
   * empty after filtering pure nouns/adjectives), no AI call is made.
   */
  aiMatchCandidates?: readonly PassageMatchCandidate[];
  onChange: (html: string) => void;
  onDelete: () => void;
  /** Callback fired when the user clicks a highlighted word. */
  onOpenWord?: (wordId: string) => void;
  /** Persist updated AI matches to the block data so they survive reload. */
  onAiMatchesChange?: (matches: CachedPassageMatch[]) => void;
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
  aiMatchCandidates,
  onChange,
  onDelete,
  onOpenWord,
  onAiMatchesChange,
}: RichTextBlockProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'view' | 'edit'>(autoFocus ? 'edit' : 'view');
  // We mirror the canonical HTML in local state so view mode updates
  // immediately on blur without waiting for the parent's prop round-trip.
  const [html, setHtml] = useState<string>((block.data as RichTextBlockData)?.html ?? '');
  // AI-detected matches for the current `html`. Initialised from the
  // cached value persisted in the block data so highlights appear
  // instantly on page load. The background effect refreshes them and
  // calls `onAiMatchesChange` when the result differs.
  const [aiMatches, setAiMatches] = useState<PassageWordMatch[]>(
    () => (block.data as RichTextBlockData)?.cachedAiMatches ?? [],
  );

  // When the block prop changes from the parent (e.g. due to a remote
  // sync), refresh the local mirror unless we are actively editing.
  useEffect(() => {
    if (mode !== 'edit') {
      const nextHtml = (block.data as RichTextBlockData)?.html ?? '';
      setHtml(nextHtml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id, (block.data as RichTextBlockData)?.html]);

  // Restore cached AI matches when block data arrives after mount.
  // The useState initialiser above fires only once; if the block was
  // still loading at that point, cachedAiMatches would have been [].
  // This effect catches the late-arriving data and seeds the state so
  // highlights show up instantly without waiting for the API refresh.
  const cachedRef = useRef(aiMatches);
  useEffect(() => {
    const cached = (block.data as RichTextBlockData)?.cachedAiMatches;
    if (!cached || cached.length === 0) return;
    // Only restore if we currently have nothing (avoid overwriting
    // a fresh API response with stale cache).
    if (cachedRef.current.length === 0) {
      cachedRef.current = cached;
      setAiMatches(cached);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id, (block.data as RichTextBlockData)?.cachedAiMatches]);

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

  // Stable list of candidates that are actually worth sending to the LLM.
  // Re-derived only when the upstream candidate list reference changes so
  // the fetch effect below doesn't fire on every re-render.
  const eligibleAiCandidates = useMemo(
    () => filterCandidatesForAi(aiMatchCandidates ? [...aiMatchCandidates] : []),
    [aiMatchCandidates],
  );

  // Hash the eligible candidates to a small string so the fetch effect can
  // depend on it without needing deep-equal comparison.
  const aiCandidatesKey = useMemo(
    () => eligibleAiCandidates.map((c) => `${c.id}:${c.english}`).join('|'),
    [eligibleAiCandidates],
  );

  // Plain text fingerprint of the passage, used to decide whether to fetch
  // (and to short-circuit when there is nothing meaningful to analyze).
  const passagePlainText = useMemo(() => extractPlainText(html), [html]);

  // Fetch AI passage matches whenever the *view-mode* HTML or candidate
  // list changes. Debounced to avoid thrashing the API while the user
  // is editing (we only re-render the highlights in view mode anyway).
  // On the first render the cached value from block data is already in
  // state, so the user sees highlights instantly; this effect only fires
  // to refresh stale caches in the background.
  const onAiMatchesChangeRef = useRef(onAiMatchesChange);
  onAiMatchesChangeRef.current = onAiMatchesChange;
  useEffect(() => {
    if (mode === 'edit') return;
    if (eligibleAiCandidates.length === 0) {
      // Only clear if we actually had matches (avoid needless re-renders).
      setAiMatches((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    if (passagePlainText.length < 8) {
      setAiMatches((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch('/api/passage-word-matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            signal: controller.signal,
            body: JSON.stringify({
              text: passagePlainText,
              candidates: eligibleAiCandidates.map((c) => ({
                id: c.id,
                english: c.english,
                ...(c.partOfSpeechTags ? { partOfSpeechTags: c.partOfSpeechTags } : {}),
              })),
            }),
          });
          if (!res.ok) {
            // Soft-fail: keep cached/exact-match highlights.
            return;
          }
          const json = (await res.json()) as {
            success?: boolean;
            matches?: PassageWordMatch[];
          };
          if (!controller.signal.aborted && json.success && Array.isArray(json.matches)) {
            setAiMatches((prev) => {
              const next = json.matches!;
              // Skip state update + persist when the result is identical.
              if (areSameMatches(prev, next)) return prev;
              // Persist the fresh result so subsequent reloads are instant.
              onAiMatchesChangeRef.current?.(next);
              return next;
            });
          }
        } catch (error) {
          if ((error as Error)?.name !== 'AbortError') {
            console.warn('[RichTextBlock] AI passage match failed', error);
          }
          // On error keep whatever cached matches we already have.
        }
      })();
    }, 600);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, passagePlainText, aiCandidatesKey]);

  const highlightedHtml = useMemo(() => {
    const hasExact = !!(wordHighlightMap && wordHighlightMap.size > 0);
    const hasAi = aiMatches.length > 0;
    if (!hasExact && !hasAi) return html;
    return highlightWordsInHtml(html, wordHighlightMap ?? new Map(), aiMatches);
  }, [html, wordHighlightMap, aiMatches]);

  return (
    <div className="group relative lg:pl-7">
      {/* Rounded frame container */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        {/* Toolbar row: formatting tools (edit mode) or edit button (view mode) */}
        <div className="mb-3 flex items-center justify-between">
          {mode === 'edit' ? (
            <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-1">
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
          ) : (
            <div /> /* spacer */
          )}
          <div className="flex items-center gap-1">
            {mode === 'view' && (
              <button
                type="button"
                onClick={() => setMode('edit')}
                aria-label="編集"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
              >
                <Icon name="edit" size={16} />
              </button>
            )}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onDelete();
              }}
              aria-label="ブロックを削除"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

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
            data-placeholder="本文を入力..."
            className="rich-text-block text-[var(--color-foreground)]"
            onClick={(e) => {
              const target = e.target as HTMLElement | null;
              if (target) {
                const span = target.closest('[data-merken-word-id]');
                if (span) {
                  const wid = span.getAttribute('data-merken-word-id');
                  if (wid && onOpenWord) onOpenWord(wid);
                }
              }
            }}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        )}
      </div>
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

/** Shallow comparison of two match arrays to avoid needless persists. */
function areSameMatches(
  a: readonly PassageWordMatch[],
  b: readonly PassageWordMatch[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].matchedText !== b[i].matchedText) return false;
  }
  return true;
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
 * Extract plain visible text from an HTML fragment for AI passage analysis.
 * Returns an empty string in non-browser environments. Whitespace inside
 * the source HTML is preserved so that LLM-returned `matchedText` strings
 * (which must be exact substrings of this same text) line up at runtime.
 */
export function extractPlainText(html: string): string {
  if (typeof window === 'undefined') return '';
  if (!html) return '';
  const template = document.createElement('template');
  template.innerHTML = html;
  return (template.content.textContent ?? '').trim();
}

/**
 * Walk an HTML string and wrap occurrences of known words in
 * `<span class="merken-highlighted-word" data-merken-word-id="...">`.
 *
 * Two complementary passes:
 *
 * 1. **AI matches** (issue #91): exact substrings provided by the
 *    `/api/passage-word-matches` endpoint are wrapped first. Each entry
 *    in `aiMatches` represents one occurrence; entries with the same
 *    `matchedText` are consumed in order so duplicates land on distinct
 *    occurrences. This pass handles inflected verbs ("running" for "run")
 *    and templatic idioms ("any other language than english" for
 *    "any other ~ than A").
 *
 * 2. **Exact regex matches**: case-insensitive word-boundary matching
 *    against `wordMap` keys. Longer keys are tried first so "ice cream"
 *    wins over "ice". The walker skips text already wrapped by pass 1
 *    (it never recurses into existing highlight spans).
 */
export function highlightWordsInHtml(
  html: string,
  wordMap: Map<string, string>,
  aiMatches: readonly PassageWordMatch[] = [],
): string {
  if (typeof window === 'undefined') return html;
  if (wordMap.size === 0 && aiMatches.length === 0) return html;

  const template = document.createElement('template');
  template.innerHTML = html;

  // ---------- Pass 1: AI matches ----------
  if (aiMatches.length > 0) {
    // Sort by length descending so longer template matches win when the
    // model returns overlapping spans (e.g. "a sudden surge in electricity"
    // vs "sudden surge").
    const remaining: Array<{ id: string; matchedText: string }> = [...aiMatches]
      .filter((m) => !!m.matchedText)
      .sort((a, b) => b.matchedText.length - a.matchedText.length)
      .map((m) => ({ id: m.id, matchedText: m.matchedText }));

    const walkAi = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (remaining.length === 0) return;
        const text = node.textContent ?? '';
        if (!text) return;
        const ranges: Array<{ start: number; end: number; wordId: string }> = [];
        for (let i = 0; i < remaining.length; i++) {
          const entry = remaining[i];
          const idx = text.indexOf(entry.matchedText);
          if (idx === -1) continue;
          const end = idx + entry.matchedText.length;
          if (
            ranges.some((r) => idx < r.end && end > r.start)
          ) {
            // Conflicts with a previously-claimed range in this node; skip.
            continue;
          }
          ranges.push({ start: idx, end, wordId: entry.id });
          remaining.splice(i, 1);
          i--;
        }
        if (ranges.length === 0) return;
        ranges.sort((a, b) => a.start - b.start);
        const frag = document.createDocumentFragment();
        let cursor = 0;
        for (const r of ranges) {
          if (r.start > cursor) {
            frag.appendChild(document.createTextNode(text.slice(cursor, r.start)));
          }
          const span = document.createElement('span');
          span.className = 'merken-highlighted-word';
          span.setAttribute('data-merken-word-id', r.wordId);
          span.textContent = text.slice(r.start, r.end);
          frag.appendChild(span);
          cursor = r.end;
        }
        if (cursor < text.length) {
          frag.appendChild(document.createTextNode(text.slice(cursor)));
        }
        node.parentNode?.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        if (el.classList?.contains('merken-highlighted-word')) return;
        for (const child of Array.from(el.childNodes)) {
          walkAi(child);
        }
      }
    };

    for (const child of Array.from(template.content.childNodes)) {
      walkAi(child);
    }
  }

  // ---------- Pass 2: exact regex matches ----------
  const keys = [...wordMap.keys()]
    .filter((k) => k.length > 0)
    .sort((a, b) => b.length - a.length);
  if (keys.length === 0) return template.innerHTML;
  // \b is a word boundary (transition between [A-Za-z0-9_] and anything
  // else). Combined with the `i` flag, this matches "hello" inside "Hello"
  // even when the word in the project list is lowercased and the text
  // capitalizes it at the start of a sentence. We deliberately avoid
  // lookbehind assertions for broader browser support (older Safari).
  const pattern = new RegExp(
    `\\b(${keys.map(escapeRegExp).join('|')})\\b`,
    'gi',
  );

  const walkExact = (node: Node) => {
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
        walkExact(child);
      }
    }
  };

  for (const child of Array.from(template.content.childNodes)) {
    walkExact(child);
  }

  // escapeHtml is referenced elsewhere for safety nets but not directly
  // needed here since DOM nodes are built via the DOM API.
  void escapeHtml;

  return template.innerHTML;
}
