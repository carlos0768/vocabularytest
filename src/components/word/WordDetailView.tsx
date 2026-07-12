'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createSwapy } from 'swapy';
import { Icon } from '@/components/ui';
import { SolidPanel, SolidButton } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { getCachedProjectWords, updateProjectWordsCache } from '@/lib/home-cache';
import type { Word, CustomSection, CustomColumn, SubscriptionStatus } from '@/types';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { hasDisplayableMorphology } from '@/lib/morphology/format';

function formatCustomSectionValue(value: string, type: CustomColumn['type']): string {
  if (!value) return '';
  if (type === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString('ja-JP') : value;
  }
  if (type === 'date') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }
  return value;
}

const POS_LABELS: Record<string, string> = {
  noun: '名詞',
  verb: '動詞',
  adjective: '形容詞',
  adverb: '副詞',
  phrase: '句',
  idiom: 'イディオム',
  phrasal_verb: '句動詞',
  preposition: '前置詞',
  conjunction: '接続詞',
  pronoun: '代名詞',
  determiner: '限定詞',
  article: '冠詞',
  interjection: '感嘆詞',
};

function findCachedWord(wordId: string): Word | null {
  const cache = getCachedProjectWords();
  for (const list of Object.values(cache)) {
    const found = list.find((w) => w.id === wordId);
    if (found) return found;
  }
  return null;
}

export interface WordDetailViewProps {
  wordId: string;
  /** Called when the user taps the close/back button or the not-found "戻る" button. */
  onClose: () => void;
  /** "page" = standalone full-height page; "modal" = embedded inside a sheet modal. */
  variant?: 'page' | 'modal';
  /** Called after any successful write (favorite toggle, vocab type cycle, save edit). */
  onWordUpdated?: (word: Word) => void;
  /** Called when the user taps the delete button. */
  onDelete?: (wordId: string) => void;
  /**
   * Optional pre-known word object. When opened from the project list we already
   * have the full word in the parent's state (including freshly manually added
   * words that are not yet reflected in the home-cache snapshot and may not
   * live in the same repository backend the modal reads from). Passing it here
   * lets the modal render instantly with the correct data AND prevents the
   * async repository reload from clobbering the UI with a "word not found"
   * state when the repositories disagree about where the word is stored.
   */
  initialWord?: Word | null;
}

export function WordDetailView({
  wordId,
  onClose,
  variant = 'page',
  onWordUpdated,
  onDelete,
  initialWord: initialWordFromProps,
}: WordDetailViewProps) {
  const isModal = variant === 'modal';

  const { subscription, loading: authLoading } = useAuth();
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  // Seed initial word from the explicit prop first (passed by the project
  // page with the word already in its state), then fall back to the global
  // in-memory list cache so direct-link opens from /word/[id] still get an
  // instant render when possible.
  const initialWord = useMemo(
    () => initialWordFromProps ?? findCachedWord(wordId),
    [wordId, initialWordFromProps],
  );
  const [word, setWord] = useState<Word | null>(initialWord);
  // Keep the latest known word accessible to async effects without having
  // to depend on the `word` state (which would retrigger the load effect on
  // every update). This lets the repository-reload effect fall back to the
  // most recent word we actually showed when the lookup misses.
  const latestWordRef = useRef<Word | null>(initialWord);
  useEffect(() => {
    latestWordRef.current = word;
  }, [word]);
  const [projectCustomColumns, setProjectCustomColumns] = useState<CustomColumn[]>([]);
  const [loading, setLoading] = useState(initialWord === null);

  const columnTypeById = useMemo(() => {
    const map = new Map<string, CustomColumn['type']>();
    for (const col of projectCustomColumns) map.set(col.id, col.type);
    return map;
  }, [projectCustomColumns]);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [sections, setSections] = useState<CustomSection[]>([]);
  const [saving, setSaving] = useState(false);
  const [editJapanese, setEditJapanese] = useState('');
  const [editExampleSentence, setEditExampleSentence] = useState('');
  const [editExampleSentenceJa, setEditExampleSentenceJa] = useState('');

  // Swapy — order tracking via ref (NOT state) to avoid re-render conflicts
  const swapyContainerRef = useRef<HTMLDivElement>(null);
  const swapyRef = useRef<ReturnType<typeof createSwapy> | null>(null);
  const swapyOrderRef = useRef<string[]>([]); // ordered section IDs after swaps
  // Track the number of slots for triggering swapy re-init
  const [slotCount, setSlotCount] = useState(0);

  // Keep the in-memory project-words cache in sync with edits made here,
  // otherwise the project list page re-renders with stale data on return
  // (first showing pre-edit values, then flashing to post-edit values).
  const syncHomeCacheForWord = useCallback((updated: Word) => {
    const projectId = updated.projectId;
    if (!projectId) return;
    const cached = getCachedProjectWords()[projectId];
    if (!cached) return;
    updateProjectWordsCache(
      projectId,
      cached.map((w) => (w.id === updated.id ? updated : w))
    );
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const fetched = await repository.getWord(wordId);
        if (cancelled) return;

        // If the repository lookup misses but we already have a word we
        // previously showed (from the initialWord prop or an earlier
        // successful load), keep showing it. Overwriting with null here
        // is what triggered "単語が見つかりません" for manually added
        // words when the parent wrote through a different repository
        // backend than the modal reads from (e.g. remote-only vs. local
        // IndexedDB).
        const w: Word | null = fetched ?? latestWordRef.current ?? null;
        setWord(w);

        // Load project-level custom columns. The word's own customSections hold
        // the per-word values; we synthesize placeholder sections for any
        // project column that this word hasn't filled in yet so the editor
        // surfaces them. Placeholder sections with empty content are dropped
        // on save (see handleFinishEditing) but will be regenerated on the
        // next load because the project still defines the column.
        let projectColumns: CustomColumn[] = [];
        if (w?.projectId) {
          try {
            const p = await repository.getProject(w.projectId);
            projectColumns = p?.customColumns ?? [];
          } catch (projectErr) {
            console.warn('Failed to load project custom columns:', projectErr);
          }
        }
        if (cancelled) return;
        setProjectCustomColumns(projectColumns);

        const existingSections = w?.customSections ?? [];
        const existingIds = new Set(existingSections.map((s) => s.id));
        const synthesized: CustomSection[] = projectColumns
          .filter((col) => !existingIds.has(col.id))
          .map((col) => ({ id: col.id, title: col.title, content: '' }));
        const merged = [...existingSections, ...synthesized];
        if (merged.length > 0) {
          setSections(merged);
          swapyOrderRef.current = merged.map((s) => s.id);
          setSlotCount(merged.length);
        }
      } catch (err) {
        console.error('Failed to load word:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wordId, authLoading, repository]);

  // Initialize Swapy — only depends on isEditing and slotCount
  useEffect(() => {
    if (!isEditing || slotCount < 2 || !swapyContainerRef.current) {
      swapyRef.current?.destroy();
      swapyRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      if (!swapyContainerRef.current) return;
      swapyRef.current?.destroy();

      const instance = createSwapy(swapyContainerRef.current, {
        animation: 'dynamic',
        swapMode: 'hover',
        dragAxis: 'y',
      });

      // Track order in ref only — no setState, no re-render, no DOM conflict
      instance.onSwapEnd((event) => {
        if (!event.hasChanged) return;
        swapyOrderRef.current = event.slotItemMap.asArray.map(e => e.item);
      });

      swapyRef.current = instance;
    }, 60);

    return () => {
      clearTimeout(timer);
      swapyRef.current?.destroy();
      swapyRef.current = null;
    };
  }, [isEditing, slotCount]);

  const handleSpeak = useCallback(() => {
    if (!word) return;
    const utterance = new SpeechSynthesisUtterance(word.english);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }, [word]);

  const handleStartEditing = useCallback(() => {
    if (!word) return;
    swapyOrderRef.current = sections.map(s => s.id);
    setEditJapanese(word.japanese);
    setEditExampleSentence(word.exampleSentence ?? '');
    setEditExampleSentenceJa(word.exampleSentenceJa ?? '');
    setIsEditing(true);
  }, [word, sections]);

  const handleFinishEditing = useCallback(async () => {
    if (!word) return;
    setSaving(true);
    try {
      // Resolve final order from swapy ref
      const finalOrder = swapyOrderRef.current;
      const byId = new Map(sections.map(s => [s.id, s]));
      const ordered = finalOrder
        .map(id => byId.get(id))
        .filter((s): s is CustomSection => !!s);
      // Include any sections not tracked by swapy (e.g. newly added after last init)
      const tracked = new Set(finalOrder);
      for (const s of sections) {
        if (!tracked.has(s.id)) ordered.push(s);
      }
      const cleaned = ordered.filter(s => s.title.trim() || s.content.trim());

      const trimmedJapanese = editJapanese.trim();
      const trimmedExample = editExampleSentence.trim() || undefined;
      const trimmedExampleJa = editExampleSentenceJa.trim() || undefined;

      await repository.updateWord(word.id, {
        japanese: trimmedJapanese,
        exampleSentence: trimmedExample,
        exampleSentenceJa: trimmedExampleJa,
        customSections: cleaned,
      });
      const updated: Word = {
        ...word,
        japanese: trimmedJapanese,
        exampleSentence: trimmedExample,
        exampleSentenceJa: trimmedExampleJa,
        customSections: cleaned,
      };
      setWord(prev => prev ? {
        ...prev,
        japanese: trimmedJapanese,
        exampleSentence: trimmedExample,
        exampleSentenceJa: trimmedExampleJa,
        customSections: cleaned,
      } : prev);
      setSections(cleaned);
      swapyOrderRef.current = cleaned.map(s => s.id);
      setSlotCount(cleaned.length);
      syncHomeCacheForWord(updated);
      onWordUpdated?.(updated);
    } catch (err) {
      console.error('Failed to save custom sections:', err);
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  }, [word, sections, editJapanese, editExampleSentence, editExampleSentenceJa, repository, syncHomeCacheForWord, onWordUpdated]);

  const handleAddSection = useCallback(() => {
    swapyRef.current?.destroy();
    swapyRef.current = null;

    const newSection: CustomSection = { id: crypto.randomUUID(), title: '', content: '' };
    setSections(prev => {
      const next = [...prev, newSection];
      swapyOrderRef.current = next.map(s => s.id);
      return next;
    });
    setSlotCount(prev => prev + 1);
  }, []);

  const handleRemoveSection = useCallback((id: string) => {
    swapyRef.current?.destroy();
    swapyRef.current = null;

    setSections(prev => {
      const next = prev.filter(s => s.id !== id);
      swapyOrderRef.current = next.map(s => s.id);
      return next;
    });
    setSlotCount(prev => prev - 1);
  }, []);

  const handleUpdateSection = useCallback((id: string, field: 'title' | 'content', value: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  const posDisplay = word?.partOfSpeechTags?.length
    ? word.partOfSpeechTags.map(p => POS_LABELS[p] ?? p).join('・')
    : null;
  const relatedWords = (word?.relatedWords ?? []).filter((item) => item.term.trim());
  const usagePatterns = (word?.usagePatterns ?? []).filter((item) => item.pattern.trim() && item.meaningJa.trim());

  const highlightWord = (sentence: string, target: string) => {
    if (!sentence || !target) return sentence;
    const regex = new RegExp(`(${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const tester = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const parts = sentence.split(regex);
    return parts.map((part, i) =>
      tester.test(part) ? <strong key={i} className="rounded-[5px] bg-[var(--color-accent-subtle)] px-1 font-black text-[var(--solid-ink)]">{part}</strong> : part
    );
  };

  const hasEmptySection = useMemo(
    () => sections.some(s => !s.title.trim() && !s.content.trim()),
    [sections],
  );

  // For read mode: resolve display order from swapyOrderRef
  const displaySections = useMemo(() => {
    if (sections.length === 0) return [];
    return sections.filter((section) => section.title.trim() || section.content.trim());
  }, [sections]);

  if (loading && !word) {
    return (
      <div className={isModal ? 'flex items-center justify-center py-16' : 'flex min-h-screen items-center justify-center bg-[var(--color-background)]'}>
        <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
      </div>
    );
  }

  if (!word) {
    return (
      <div className={isModal ? 'flex flex-col items-center justify-center px-6 py-16 text-center' : 'flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 text-center'}>
        <h1 className="font-display text-xl font-black text-[var(--solid-ink)]">単語が見つかりません</h1>
        <button onClick={onClose} className="mt-4 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-6 py-2.5 font-display text-sm font-bold text-[var(--solid-ink)]">
          戻る
        </button>
      </div>
    );
  }

  return (
    <div className={isModal ? 'bg-[var(--color-background)] pb-6 font-[var(--font-body)]' : 'min-h-screen bg-[var(--color-background)] pb-24 font-[var(--font-body)]'}>
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 pb-3 pt-4 sm:px-7">
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label={isModal ? '閉じる' : '戻る'}
        >
          <Icon name={isModal ? 'close' : 'chevron_left'} size={16} />
        </button>
        {isEditing ? (
          <button
            onClick={handleFinishEditing}
            disabled={saving}
            className="rounded-full border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-2 font-display text-sm font-bold text-white shadow-[2px_2px_0_rgba(26,26,26,0.22)] disabled:opacity-50"
          >
            {saving ? '保存中...' : '完了'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartEditing}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
              aria-label="編集"
            >
              <Icon name="edit" size={16} />
            </button>
            <button
              onClick={onDelete ? () => onDelete(wordId) : undefined}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white transition-all duration-100 active:translate-x-px active:translate-y-px"
              style={{ color: onDelete ? 'var(--color-error, #cc4d59)' : 'var(--solid-ink)' }}
              aria-label={onDelete ? '削除' : 'メニュー'}
            >
              <Icon name={onDelete ? 'delete' : 'more_horiz'} size={18} />
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-xl px-5 pt-1 sm:px-7">
        <section className="pb-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="min-w-0 break-words font-display text-[28px] font-black leading-[1.1] tracking-normal text-[var(--solid-ink)] sm:text-[32px]">
              {word.english}
            </h1>
            <button
              onClick={handleSpeak}
              className="inline-flex shrink-0 items-center gap-1.5 text-[14px] font-medium leading-none text-[var(--color-ink-muted)]"
              aria-label="発音を再生"
            >
              <span className="min-w-0 truncate font-mono">{word.pronunciation || '―'}</span>
              <Icon name="volume_up" size={15} />
            </button>
          </div>

          {isEditing ? (
            <div className="mt-3 space-y-1">
              <input
                type="text"
                value={editJapanese}
                onChange={(e) => setEditJapanese(e.target.value)}
                className="w-full rounded-[12px] border-2 border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3.5 py-2.5 text-[15px] font-bold text-[var(--solid-ink)] outline-none"
              />
            </div>
          ) : (
            <p className="mt-2 text-[17px] font-bold leading-[1.55] text-[var(--solid-ink)]">
              {posDisplay && <span className="mr-2 text-[14px] text-[var(--color-ink-muted)]">({posDisplay})</span>}
              <TranslationDisplay word={word} />
            </p>
          )}
        </section>

        <SectionDivider />

        <section className="py-4">
          <div className="mb-3 flex items-center justify-between">
            <SectionHeading title="EXAMPLE" />
            <span className="font-mono text-[11px] font-bold text-[var(--color-muted)]">例文</span>
          </div>
          {isEditing ? (
            <div className="space-y-2.5">
              <textarea
                value={editExampleSentence}
                onChange={(e) => setEditExampleSentence(e.target.value)}
                placeholder="例文（英語）を入力..."
                rows={2}
                className="w-full resize-none rounded-[14px] border-2 border-[var(--solid-ink)] bg-white px-4 py-3 text-[14px] leading-relaxed text-[var(--solid-ink)] outline-none"
              />
              <textarea
                value={editExampleSentenceJa}
                onChange={(e) => setEditExampleSentenceJa(e.target.value)}
                placeholder="例文の日本語訳を入力..."
                rows={2}
                className="w-full resize-none rounded-[14px] border-2 border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-muted)] outline-none"
              />
            </div>
          ) : word.exampleSentence ? (
            <div>
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 text-[15px] font-medium leading-[1.6] text-[var(--solid-ink)]">
                  {highlightWord(word.exampleSentence, word.english)}
                </p>
                <button onClick={() => {
                  if (!word.exampleSentence) return;
                  const u = new SpeechSynthesisUtterance(word.exampleSentence);
                  u.lang = 'en-US';
                  u.rate = 0.85;
                  speechSynthesis.speak(u);
                }} className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-white text-[var(--color-ink-muted)]" aria-label="例文を再生">
                  <Icon name="volume_up" size={16} />
                </button>
              </div>
              {word.exampleSentenceJa && (
                <p className="mt-3 text-[13px] leading-[1.55] text-[var(--color-ink-muted)]">{word.exampleSentenceJa}</p>
              )}
            </div>
          ) : (
            <p className="text-[13px] font-medium text-[var(--color-muted)]">
              例文はまだ生成されていません
            </p>
          )}
        </section>

        {hasDisplayableMorphology(word.morphology) && (
          <>
            <SectionDivider />
            <section className="py-4">
              <div className="mb-3 flex items-center justify-between">
                <SectionHeading title="ETYMOLOGY" />
                <span className="font-mono text-[11px] font-bold text-[var(--color-muted)]">語源</span>
              </div>
              {/* 式: un(否定) ＋ anim(心) ＋ ous(形容詞化) */}
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                {word.morphology.formula.map((part, index) => (
                  <span key={`${part.text}-${index}`} className="flex items-center gap-1.5">
                    {index > 0 && (
                      <span className="text-[14px] font-bold text-[var(--color-muted)]">＋</span>
                    )}
                    <span
                      className={`rounded-full border-2 px-2.5 py-1 font-display text-[13px] font-bold leading-none ${
                        part.kind === 'root'
                          ? 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]'
                          : 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent-ink)]'
                      }`}
                    >
                      {part.text}
                      <span className="ml-1 text-[11px] font-semibold opacity-80">({part.meaningJa})</span>
                    </span>
                  </span>
                ))}
              </div>
              <p className="mt-3 whitespace-pre-line text-[13px] leading-[1.6] text-[var(--color-ink-muted)]">
                {word.morphology.explanation}
              </p>
            </section>
          </>
        )}

        {relatedWords.length > 0 && (
          <>
            <SectionDivider />
            <section className="py-4">
              <SectionHeading title="RELATED" />
              <div className="mt-3 flex flex-wrap gap-2">
                {relatedWords.map((item, index) => (
                  <span key={`${item.term}-${index}`} className="rounded-full border-2 border-[var(--color-border)] bg-white px-3 py-1.5 font-display text-[13px] font-bold leading-none text-[var(--solid-ink)]">
                    {item.term}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}

        {usagePatterns.length > 0 && (
          <>
            <SectionDivider />
            <section className="py-4">
              <SectionHeading title="USAGE" />
              <div className="mt-3 space-y-3">
                {usagePatterns.map((pattern, index) => (
                  <div key={`${pattern.pattern}-${index}`} className="rounded-r-[10px] border-l-[3px] border-[var(--color-accent)] bg-[var(--color-surface-alt)] px-4 py-3">
                    <div className="font-display text-[14px] font-black leading-snug text-[var(--solid-ink)]">{pattern.pattern}</div>
                    <div className="mt-1.5 text-[12px] leading-snug text-[var(--color-ink-muted)]">{pattern.meaningJa}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {isEditing ? (
          <>
            <SectionDivider />
            <div className="py-4">
              <SolidPanel faceClassName="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-[var(--solid-ink)]">CUSTOM</h3>
                  <SolidButton
                    onClick={handleAddSection}
                    disabled={hasEmptySection}
                    variant="inverse"
                    size="sm"
                    iconLeft="add"
                  >
                    追加
                  </SolidButton>
                </div>

                {sections.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--color-muted)]">
                    ＋ボタンからセクションを追加できます
                  </p>
                ) : (
                  <div ref={swapyContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {sections.map((section, i) => {
                      const columnType = columnTypeById.get(section.id) ?? 'text';
                      const isProjectColumn = columnTypeById.has(section.id);
                      return (
                      <div key={`slot-${i}`} data-swapy-slot={`slot-${i}`}>
                        <div data-swapy-item={section.id} className="space-y-2 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-3">
                          <div className="flex items-center gap-2">
                            <div data-swapy-handle className="cursor-grab active:cursor-grabbing touch-none p-1">
                              <Icon name="drag_indicator" size={18} className="text-[var(--color-muted)]" />
                            </div>
                            <input
                              type="text"
                              value={section.title}
                              onChange={(e) => handleUpdateSection(section.id, 'title', e.target.value)}
                              placeholder="セクション名"
                              readOnly={isProjectColumn}
                              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
                            />
                            {!isProjectColumn && (
                              <button
                                onClick={() => handleRemoveSection(section.id)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-surface-secondary)]"
                                aria-label="セクションを削除"
                              >
                                <Icon name="close" size={16} className="text-[var(--color-muted)]" />
                              </button>
                            )}
                          </div>
                          {columnType === 'number' ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              value={section.content}
                              onChange={(e) => handleUpdateSection(section.id, 'content', e.target.value)}
                              placeholder="数値を入力..."
                              className="w-full bg-transparent text-sm text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
                            />
                          ) : columnType === 'date' ? (
                            <input
                              type="date"
                              value={section.content}
                              onChange={(e) => handleUpdateSection(section.id, 'content', e.target.value)}
                              className="w-full bg-transparent text-sm text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
                            />
                          ) : (
                            <textarea
                              value={section.content}
                              onChange={(e) => handleUpdateSection(section.id, 'content', e.target.value)}
                              placeholder="内容を入力..."
                              rows={3}
                              className="w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
                            />
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </SolidPanel>
            </div>
          </>
        ) : displaySections.length > 0 ? (
          <>
            {displaySections.map((section) => {
              const columnType = columnTypeById.get(section.id) ?? 'text';
              const display = formatCustomSectionValue(section.content, columnType);
              return (
                <section key={section.id}>
                  <SectionDivider />
                  <div className="py-4">
                    <SolidPanel faceClassName="space-y-2">
                      <h2 className="font-mono text-[13px] font-black uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
                        {section.title}
                      </h2>
                      <p className="whitespace-pre-wrap text-[13px] leading-6 text-[var(--solid-ink)]">{display || '—'}</p>
                    </SolidPanel>
                  </div>
                </section>
              );
            })}
          </>
        ) : null}
      </main>
    </div>
  );
}

function SectionDivider() {
  return <div className="h-px w-full bg-[var(--color-border)]" />;
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
      {title}
    </h2>
  );
}
