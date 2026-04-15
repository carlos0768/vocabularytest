'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createSwapy } from 'swapy';
import { Icon } from '@/components/ui';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { getCachedProjectWords, updateProjectWordsCache } from '@/lib/home-cache';
import { getNextVocabularyType, getVocabularyTypeLabel } from '@/lib/vocabulary-type';
import type { Word, CustomSection, CustomColumn, SubscriptionStatus } from '@/types';

const STATUS_LABELS: Record<string, string> = {
  mastered: '習得',
  review: '学習中',
  learning: '学習中',
  new: '未学習',
};

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

  const handleToggleFavorite = useCallback(async () => {
    if (!word) return;
    const newFav = !word.isFavorite;
    try {
      await repository.updateWord(word.id, { isFavorite: newFav });
      const updated = { ...word, isFavorite: newFav };
      setWord((prev) => (prev ? { ...prev, isFavorite: newFav } : prev));
      syncHomeCacheForWord(updated);
      onWordUpdated?.(updated);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }, [word, repository, syncHomeCacheForWord, onWordUpdated]);

  const handleCycleVocabularyType = useCallback(async () => {
    if (!word) return;
    const nextVocabularyType = getNextVocabularyType(word.vocabularyType);
    try {
      await repository.updateWord(word.id, { vocabularyType: nextVocabularyType });
      const updated = { ...word, vocabularyType: nextVocabularyType };
      setWord((prev) => (prev ? { ...prev, vocabularyType: nextVocabularyType } : prev));
      syncHomeCacheForWord(updated);
      onWordUpdated?.(updated);
    } catch (err) {
      console.error('Failed to update vocabulary type:', err);
    }
  }, [word, repository, syncHomeCacheForWord, onWordUpdated]);

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

  const statusLabel = word?.status ? (STATUS_LABELS[word.status] ?? '未学習') : '未学習';
  const vocabularyTypeLabel = getVocabularyTypeLabel(word?.vocabularyType);
  const posDisplay = word?.partOfSpeechTags?.length
    ? word.partOfSpeechTags.map(p => POS_LABELS[p] ?? p).join('・')
    : null;

  const highlightWord = (sentence: string, target: string) => {
    if (!sentence || !target) return sentence;
    const regex = new RegExp(`(${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = sentence.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <strong key={i} className="font-bold underline decoration-2">{part}</strong> : part
    );
  };

  // For read mode: resolve display order from swapyOrderRef
  const displaySections = useMemo(() => {
    if (sections.length === 0) return [];
    return sections; // In read mode, sections state IS the saved order
  }, [sections]);

  if (loading && !word) {
    return (
      <div className={isModal ? 'flex items-center justify-center py-16' : 'min-h-screen flex items-center justify-center'}>
        <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
      </div>
    );
  }

  if (!word) {
    return (
      <div className={isModal ? 'flex flex-col items-center justify-center px-6 py-16 text-center' : 'min-h-screen flex flex-col items-center justify-center px-6 text-center'}>
        <h1 className="text-xl font-bold text-[var(--color-foreground)]">単語が見つかりません</h1>
        <button onClick={onClose} className="mt-4 px-6 py-2.5 rounded-xl bg-[var(--color-foreground)] text-white font-semibold">
          戻る
        </button>
      </div>
    );
  }

  return (
    <div className={isModal ? 'pb-6' : 'min-h-screen pb-24'}>
      {/* Header */}
      <header className="px-5 pt-4 pb-2 flex items-center justify-between">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full border border-[var(--color-border)] flex items-center justify-center"
          aria-label={isModal ? '閉じる' : '戻る'}
        >
          <Icon name={isModal ? 'close' : 'chevron_left'} size={isModal ? 20 : 24} className="text-[var(--color-foreground)]" />
        </button>
        {isEditing ? (
          <button
            onClick={handleFinishEditing}
            disabled={saving}
            className="px-4 py-2 rounded-full bg-[var(--color-foreground)] text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? '保存中...' : '完了'}
          </button>
        ) : (
          <button
            onClick={handleStartEditing}
            className="w-10 h-10 rounded-full border border-[var(--color-border)] flex items-center justify-center"
            aria-label="編集"
          >
            <Icon name="edit" size={18} className="text-[var(--color-foreground)]" />
          </button>
        )}
      </header>

      <main className="max-w-lg mx-auto px-5 pt-4 space-y-6">
        {/* Word title + status */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-[var(--color-foreground)]">{word.english}</h1>
            <span className="px-3 py-1 rounded-full bg-[var(--color-surface-secondary)] text-xs font-semibold text-[var(--color-muted)]">
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-muted)]">{word.pronunciation || '——'}</span>
              <button onClick={handleSpeak} className="w-8 h-8 rounded-full bg-[var(--color-surface-secondary)] flex items-center justify-center" aria-label="発音を再生">
                <Icon name="volume_up" size={16} className="text-[var(--color-foreground)]" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <VocabularyTypeButton
                  vocabularyType={word.vocabularyType}
                  onClick={handleCycleVocabularyType}
                  size="md"
                />
                <span className="text-sm text-[var(--color-muted)]">{vocabularyTypeLabel}</span>
              </div>
              <button onClick={handleToggleFavorite} aria-label="お気に入り切替">
                <Icon
                  name="bookmark"
                  size={24}
                  filled={word.isFavorite}
                  className={word.isFavorite ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted)]'}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Part of speech + Japanese */}
        <div className="border-t border-[var(--color-border-light)] pt-4">
          {isEditing ? (
            <div className="space-y-1">
              {posDisplay && <span className="text-sm text-[var(--color-muted)]">({posDisplay})</span>}
              <input
                type="text"
                value={editJapanese}
                onChange={(e) => setEditJapanese(e.target.value)}
                className="w-full text-base text-[var(--color-foreground)] bg-[var(--color-surface-secondary)] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--color-foreground)]/20"
              />
            </div>
          ) : (
            <p className="text-base text-[var(--color-foreground)]">
              {posDisplay && <span className="text-[var(--color-muted)]">({posDisplay}) </span>}
              {word.japanese}
            </p>
          )}
        </div>

        {/* Example sentence */}
        {isEditing ? (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[var(--color-foreground)]">例文</h3>
            <textarea
              value={editExampleSentence}
              onChange={(e) => setEditExampleSentence(e.target.value)}
              placeholder="例文（英語）を入力..."
              rows={2}
              className="w-full text-base text-[var(--color-foreground)] bg-[var(--color-surface-secondary)] rounded-lg px-3 py-2 outline-none resize-none focus:ring-2 focus:ring-[var(--color-foreground)]/20 leading-relaxed"
            />
            <textarea
              value={editExampleSentenceJa}
              onChange={(e) => setEditExampleSentenceJa(e.target.value)}
              placeholder="例文の日本語訳を入力..."
              rows={2}
              className="w-full text-sm text-[var(--color-muted)] bg-[var(--color-surface-secondary)] rounded-lg px-3 py-2 outline-none resize-none focus:ring-2 focus:ring-[var(--color-foreground)]/20 leading-relaxed"
            />
          </div>
        ) : word.exampleSentence ? (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[var(--color-foreground)]">例文</h3>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-base text-[var(--color-foreground)] leading-relaxed">
                  {highlightWord(word.exampleSentence, word.english)}
                </p>
              </div>
              <button onClick={() => {
                if (!word.exampleSentence) return;
                const u = new SpeechSynthesisUtterance(word.exampleSentence);
                u.lang = 'en-US';
                u.rate = 0.85;
                speechSynthesis.speak(u);
              }} className="shrink-0 mt-1" aria-label="例文を再生">
                <Icon name="volume_up" size={20} className="text-[var(--color-muted)]" />
              </button>
            </div>
            {word.exampleSentenceJa && (
              <p className="text-sm text-[var(--color-muted)]">{word.exampleSentenceJa}</p>
            )}
          </div>
        ) : null}

        {/* Custom Sections */}
        {isEditing ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--color-foreground)]">カスタムセクション</h3>
              <button
                onClick={handleAddSection}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--color-foreground)] text-white text-xs font-semibold"
              >
                <Icon name="add" size={14} />
                追加
              </button>
            </div>

            {sections.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)] text-center py-6">
                ＋ボタンからセクションを追加できます
              </p>
            ) : (
              <div ref={swapyContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sections.map((section, i) => {
                  const columnType = columnTypeById.get(section.id) ?? 'text';
                  const isProjectColumn = columnTypeById.has(section.id);
                  return (
                  <div key={`slot-${i}`} data-swapy-slot={`slot-${i}`}>
                    <div data-swapy-item={section.id} className="p-4 space-y-2 border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)]">
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
                          className="flex-1 text-sm font-bold text-[var(--color-foreground)] bg-transparent outline-none placeholder:text-[var(--color-muted)]"
                        />
                        {!isProjectColumn && (
                          <button
                            onClick={() => handleRemoveSection(section.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--color-surface-secondary)]"
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
                          className="w-full text-sm text-[var(--color-foreground)] bg-transparent outline-none placeholder:text-[var(--color-muted)]"
                        />
                      ) : columnType === 'date' ? (
                        <input
                          type="date"
                          value={section.content}
                          onChange={(e) => handleUpdateSection(section.id, 'content', e.target.value)}
                          className="w-full text-sm text-[var(--color-foreground)] bg-transparent outline-none placeholder:text-[var(--color-muted)]"
                        />
                      ) : (
                        <textarea
                          value={section.content}
                          onChange={(e) => handleUpdateSection(section.id, 'content', e.target.value)}
                          placeholder="内容を入力..."
                          rows={3}
                          className="w-full text-sm text-[var(--color-foreground)] bg-transparent outline-none resize-none placeholder:text-[var(--color-muted)] leading-relaxed"
                        />
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : displaySections.length > 0 ? (
          <div className="space-y-5 pt-2">
            {displaySections.map((section) => {
              const columnType = columnTypeById.get(section.id) ?? 'text';
              const display = formatCustomSectionValue(section.content, columnType);
              return (
                <div key={section.id} className="space-y-2">
                  <h3 className="text-sm font-bold text-[var(--color-foreground)]">{section.title}</h3>
                  <p className="text-sm text-[var(--color-foreground)] leading-relaxed whitespace-pre-wrap">{display}</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </main>
    </div>
  );
}
