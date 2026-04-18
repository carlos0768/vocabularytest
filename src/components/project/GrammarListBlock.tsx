'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  extractPlainText,
  highlightWordsInHtml,
  sanitizeRichTextHtml,
} from '@/components/project/RichTextBlock';
import {
  filterCandidatesForAi,
  type PassageMatchCandidate,
  type PassageWordMatch,
} from '@/lib/ai/match-passage-words';
import type {
  CachedPassageMatch,
  GrammarCategory,
  GrammarEntry,
  GrammarEntryBody,
} from '@/types';

const CATEGORY_OPTIONS: Array<{ value: GrammarCategory; label: string }> = [
  { value: 'usage', label: '語法' },
  { value: 'tense', label: '時制' },
  { value: 'preposition', label: '前置詞' },
  { value: 'article', label: '冠詞' },
  { value: 'conjunction', label: '接続詞' },
  { value: 'modal', label: '助動詞' },
  { value: 'clause', label: '節' },
  { value: 'other', label: 'その他' },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

export interface GrammarListBlockProps {
  entries: GrammarEntry[];
  /** View-only mode disables all editing controls. */
  readOnly?: boolean;
  /** Highlight map for the expanded body (same shape as RichTextBlock). */
  wordHighlightMap?: Map<string, string>;
  aiMatchCandidates?: readonly PassageMatchCandidate[];
  onCreate?: (entry: {
    pattern: string;
    meaning: string;
    category?: string;
    body: GrammarEntryBody;
    position: number;
  }) => void | Promise<void>;
  onUpdate?: (id: string, updates: Partial<GrammarEntry>) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  onOpenWord?: (wordId: string) => void;
}

export function GrammarListBlock({
  entries,
  readOnly,
  wordHighlightMap,
  aiMatchCandidates,
  onCreate,
  onUpdate,
  onDelete,
  onOpenWord,
}: GrammarListBlockProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.position - b.position),
    [entries],
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddRow = () => {
    if (!onCreate) return;
    const nextPosition =
      sorted.length === 0 ? 0 : sorted[sorted.length - 1].position + 1;
    void onCreate({
      pattern: '',
      meaning: '',
      body: { html: '' },
      position: nextPosition,
    });
  };

  return (
    <div className="group relative">
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
            <Icon name="table_chart" size={16} />
            文法リスト
            <span className="text-xs font-normal text-[var(--color-muted)]">{sorted.length}</span>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
            >
              <Icon name="add" size={14} />
              追加
            </button>
          )}
        </div>
        {sorted.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
            {readOnly ? '文法エントリはありません' : '「追加」から文法エントリを作成しましょう'}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {sorted.map((entry) => (
              <GrammarRow
                key={entry.id}
                entry={entry}
                readOnly={!!readOnly}
                expanded={expanded.has(entry.id)}
                onToggle={() => toggleExpand(entry.id)}
                wordHighlightMap={wordHighlightMap}
                aiMatchCandidates={aiMatchCandidates}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onOpenWord={onOpenWord}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface GrammarRowProps {
  entry: GrammarEntry;
  readOnly: boolean;
  expanded: boolean;
  onToggle: () => void;
  wordHighlightMap?: Map<string, string>;
  aiMatchCandidates?: readonly PassageMatchCandidate[];
  onUpdate?: (id: string, updates: Partial<GrammarEntry>) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  onOpenWord?: (wordId: string) => void;
}

function GrammarRow({
  entry,
  readOnly,
  expanded,
  onToggle,
  wordHighlightMap,
  aiMatchCandidates,
  onUpdate,
  onDelete,
  onOpenWord,
}: GrammarRowProps) {
  return (
    <li>
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          aria-label={expanded ? '折りたたむ' : '展開'}
          onClick={onToggle}
          className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-secondary)]"
        >
          <Icon name={expanded ? 'expand_more' : 'chevron_right'} size={16} />
        </button>
        <div className="grid flex-1 grid-cols-1 gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,1fr)]">
          <EditableText
            value={entry.pattern}
            placeholder="パターン (例: have + p.p.)"
            readOnly={readOnly}
            className="text-sm font-semibold text-[var(--color-foreground)]"
            onCommit={(v) => onUpdate?.(entry.id, { pattern: v })}
          />
          <EditableText
            value={entry.meaning}
            placeholder="意味・用法"
            readOnly={readOnly}
            className="text-sm text-[var(--color-muted)]"
            onCommit={(v) => onUpdate?.(entry.id, { meaning: v })}
          />
          <CategorySelect
            value={entry.category}
            readOnly={readOnly}
            onChange={(v) => onUpdate?.(entry.id, { category: v || undefined })}
          />
        </div>
        {!readOnly && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onDelete?.(entry.id);
            }}
            aria-label="行を削除"
            className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] opacity-0 transition-opacity hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)] group-hover:opacity-100"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-4 py-3">
          <GrammarBodyEditor
            entryId={entry.id}
            body={entry.body}
            readOnly={readOnly}
            wordHighlightMap={wordHighlightMap}
            aiMatchCandidates={aiMatchCandidates}
            onChange={(body) => onUpdate?.(entry.id, { body })}
            onOpenWord={onOpenWord}
          />
        </div>
      )}
    </li>
  );
}

function EditableText({
  value,
  placeholder,
  readOnly,
  className,
  onCommit,
}: {
  value: string;
  placeholder: string;
  readOnly: boolean;
  className?: string;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (readOnly) {
    return (
      <div className={className}>
        {value || <span className="text-[var(--color-muted)] italic">—</span>}
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`w-full cursor-text rounded px-1 py-0.5 text-left hover:bg-[var(--color-surface-secondary)] ${className ?? ''}`}
      >
        {value || <span className="text-[var(--color-muted)]">{placeholder}</span>}
      </button>
    );
  }

  return (
    <EditableTextInput
      initialValue={value}
      placeholder={placeholder}
      className={className}
      onCommit={(next) => {
        setEditing(false);
        if (next !== value) onCommit(next);
      }}
      onCancel={() => setEditing(false)}
    />
  );
}

function EditableTextInput({
  initialValue,
  placeholder,
  className,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  placeholder: string;
  className?: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  return (
    <input
      autoFocus
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      placeholder={placeholder}
      className={`w-full rounded border border-[var(--color-primary)] bg-[var(--color-surface)] px-1 py-0.5 outline-none ${className ?? ''}`}
    />
  );
}

function CategorySelect({
  value,
  readOnly,
  onChange,
}: {
  value: string | undefined;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  if (readOnly) {
    const label = value ? CATEGORY_LABEL[value] ?? value : '—';
    return <div className="text-xs text-[var(--color-muted)]">{label}</div>;
  }
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
    >
      <option value="">—</option>
      {CATEGORY_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface GrammarBodyEditorProps {
  entryId: string;
  body: GrammarEntryBody;
  readOnly: boolean;
  wordHighlightMap?: Map<string, string>;
  aiMatchCandidates?: readonly PassageMatchCandidate[];
  onChange?: (body: GrammarEntryBody) => void;
  onOpenWord?: (wordId: string) => void;
}

function GrammarBodyEditor({
  entryId,
  body,
  readOnly,
  wordHighlightMap,
  aiMatchCandidates,
  onChange,
  onOpenWord,
}: GrammarBodyEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [html, setHtml] = useState<string>(body.html ?? '');
  const [aiMatches, setAiMatches] = useState<PassageWordMatch[]>(
    () => body.cachedAiMatches ?? [],
  );

  useEffect(() => {
    if (mode !== 'edit') setHtml(body.html ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, body.html]);

  const cachedRef = useRef(aiMatches);
  useEffect(() => {
    const cached = body.cachedAiMatches;
    if (!cached || cached.length === 0) return;
    if (cachedRef.current.length === 0) {
      cachedRef.current = cached;
      setAiMatches(cached);
    }
  }, [entryId, body.cachedAiMatches]);

  useEffect(() => {
    if (mode !== 'edit' || !editorRef.current) return;
    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
    editorRef.current.focus();
    const range = document.createRange();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleBlur = () => {
    const nextHtml = sanitizeRichTextHtml(editorRef.current?.innerHTML ?? '');
    setHtml(nextHtml);
    setMode('view');
    if (nextHtml !== body.html) {
      onChange?.({
        ...body,
        html: nextHtml,
      });
    }
  };

  const eligibleAiCandidates = useMemo(
    () => filterCandidatesForAi(aiMatchCandidates ? [...aiMatchCandidates] : []),
    [aiMatchCandidates],
  );
  const aiCandidatesKey = useMemo(
    () => eligibleAiCandidates.map((c) => `${c.id}:${c.english}`).join('|'),
    [eligibleAiCandidates],
  );
  const passagePlainText = useMemo(() => extractPlainText(html), [html]);

  const onBodyChangeRef = useRef(onChange);
  onBodyChangeRef.current = onChange;

  useEffect(() => {
    if (mode === 'edit') return;
    if (eligibleAiCandidates.length === 0) {
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
          if (!res.ok) return;
          const json = (await res.json()) as {
            success?: boolean;
            matches?: PassageWordMatch[];
          };
          if (!controller.signal.aborted && json.success && Array.isArray(json.matches)) {
            setAiMatches((prev) => {
              const next = json.matches!;
              if (sameMatches(prev, next)) return prev;
              const cachedMatches: CachedPassageMatch[] = next.map((m) => ({
                id: m.id,
                matchedText: m.matchedText,
              }));
              onBodyChangeRef.current?.({
                html,
                cachedAiMatches: cachedMatches,
              });
              return next;
            });
          }
        } catch (error) {
          if ((error as Error)?.name !== 'AbortError') {
            console.warn('[GrammarListBlock] AI passage match failed', error);
          }
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

  const onClickHighlighted = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const span = target.closest('[data-merken-word-id]');
      if (span) {
        const wid = span.getAttribute('data-merken-word-id');
        if (wid && onOpenWord) onOpenWord(wid);
      }
    },
    [onOpenWord],
  );

  if (mode === 'edit' && !readOnly) {
    return (
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="詳細説明・例文・備考を入力..."
        className="rich-text-block min-h-[60px] text-sm text-[var(--color-foreground)] outline-none"
        onBlur={handleBlur}
      />
    );
  }

  const isEmpty = !html || extractPlainText(html).length === 0;
  return (
    <div
      onClick={() => !readOnly && setMode('edit')}
      className={`rich-text-block text-sm text-[var(--color-foreground)] ${readOnly ? '' : 'cursor-text'}`}
    >
      {isEmpty ? (
        <div className="text-xs text-[var(--color-muted)]">
          {readOnly ? '詳細なし' : '詳細説明・例文・備考を入力...'}
        </div>
      ) : (
        <div
          onClick={onClickHighlighted}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      )}
    </div>
  );
}

function sameMatches(
  a: readonly PassageWordMatch[],
  b: readonly PassageWordMatch[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].matchedText !== b[i].matchedText) return false;
  }
  return true;
}
