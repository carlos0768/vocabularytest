'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSwapy } from 'swapy';
import { Icon } from '@/components/ui';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { getNextVocabularyType, getVocabularyTypeLabel } from '@/lib/vocabulary-type';
import type { Word, CustomSection, SubscriptionStatus } from '@/types';

const STATUS_LABELS: Record<string, string> = {
  mastered: '習得',
  review: '学習中',
  learning: '学習中',
  new: '未学習',
};

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

export default function WordDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const wordId = params.id as string;
  const from = searchParams.get('from');

  const { subscription, loading: authLoading } = useAuth();
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [word, setWord] = useState<Word | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [sections, setSections] = useState<CustomSection[]>([]);
  const [saving, setSaving] = useState(false);

  // Swapy — slot-item mapping is the source of truth for order
  // Slots are stable indices ("slot-0", "slot-1", ...), items are section IDs
  const [slotItemMap, setSlotItemMap] = useState<Array<{ slot: string; item: string }>>([]);
  const swapyContainerRef = useRef<HTMLDivElement>(null);
  const swapyRef = useRef<ReturnType<typeof createSwapy> | null>(null);

  // Derive ordered sections from slotItemMap
  const sectionById = useMemo(() => new Map(sections.map(s => [s.id, s])), [sections]);
  const orderedSections = useMemo(() => {
    if (slotItemMap.length === 0) return sections;
    return slotItemMap
      .map(entry => sectionById.get(entry.item))
      .filter((s): s is CustomSection => !!s);
  }, [slotItemMap, sectionById, sections]);

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        const w = await repository.getWord(wordId);
        setWord(w ?? null);
        if (w?.customSections?.length) {
          setSections(w.customSections);
          setSlotItemMap(w.customSections.map((s, i) => ({ slot: `slot-${i}`, item: s.id })));
        }
      } catch (err) {
        console.error('Failed to load word:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [wordId, authLoading, repository]);

  // Initialize Swapy
  useEffect(() => {
    if (!isEditing || slotItemMap.length < 2 || !swapyContainerRef.current) {
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

      instance.onSwapEnd((event) => {
        if (!event.hasChanged) return;
        setSlotItemMap(event.slotItemMap.asArray);
      });

      swapyRef.current = instance;
    }, 60);

    return () => {
      clearTimeout(timer);
      swapyRef.current?.destroy();
      swapyRef.current = null;
    };
  // Re-init only when editing toggles or number of slots changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, slotItemMap.length]);

  const handleToggleFavorite = useCallback(async () => {
    if (!word) return;
    const newFav = !word.isFavorite;
    try {
      await repository.updateWord(word.id, { isFavorite: newFav });
      setWord((prev) => prev ? { ...prev, isFavorite: newFav } : prev);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }, [word, repository]);

  const handleCycleVocabularyType = useCallback(async () => {
    if (!word) return;
    const nextVocabularyType = getNextVocabularyType(word.vocabularyType);
    try {
      await repository.updateWord(word.id, { vocabularyType: nextVocabularyType });
      setWord((prev) => prev ? { ...prev, vocabularyType: nextVocabularyType } : prev);
    } catch (err) {
      console.error('Failed to update vocabulary type:', err);
    }
  }, [word, repository]);

  const handleSpeak = useCallback(() => {
    if (!word) return;
    const utterance = new SpeechSynthesisUtterance(word.english);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }, [word]);

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleFinishEditing = useCallback(async () => {
    if (!word) return;
    setSaving(true);
    try {
      // Use orderedSections (derived from slotItemMap) for the final order
      const cleaned = orderedSections.filter(s => s.title.trim() || s.content.trim());
      await repository.updateWord(word.id, { customSections: cleaned });
      setWord(prev => prev ? { ...prev, customSections: cleaned } : prev);
      setSections(cleaned);
      setSlotItemMap(cleaned.map((s, i) => ({ slot: `slot-${i}`, item: s.id })));
    } catch (err) {
      console.error('Failed to save custom sections:', err);
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  }, [word, orderedSections, repository]);

  const handleAddSection = useCallback(() => {
    swapyRef.current?.destroy();
    swapyRef.current = null;

    const newSection: CustomSection = { id: crypto.randomUUID(), title: '', content: '' };
    setSections(prev => [...prev, newSection]);
    setSlotItemMap(prev => [...prev, { slot: `slot-${prev.length}`, item: newSection.id }]);
  }, []);

  const handleRemoveSection = useCallback((id: string) => {
    swapyRef.current?.destroy();
    swapyRef.current = null;

    setSections(prev => prev.filter(s => s.id !== id));
    setSlotItemMap(prev => {
      const filtered = prev.filter(entry => entry.item !== id);
      // Re-index slots
      return filtered.map((entry, i) => ({ slot: `slot-${i}`, item: entry.item }));
    });
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
      </div>
    );
  }

  if (!word) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-bold text-[var(--color-foreground)]">単語が見つかりません</h1>
        <button onClick={() => router.back()} className="mt-4 px-6 py-2.5 rounded-xl bg-[var(--color-foreground)] text-white font-semibold">
          戻る
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="px-5 pt-4 pb-2 flex items-center justify-between">
        <button
          onClick={() => from ? router.replace(decodeURIComponent(from)) : router.back()}
          className="w-10 h-10 rounded-full border border-[var(--color-border)] flex items-center justify-center"
        >
          <Icon name="chevron_left" size={24} className="text-[var(--color-foreground)]" />
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

          {/* Pronunciation + bookmark */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-muted)]">{word.pronunciation || '——'}</span>
              <button onClick={handleSpeak} className="w-8 h-8 rounded-full bg-[var(--color-surface-secondary)] flex items-center justify-center">
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
              <button onClick={handleToggleFavorite}>
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
          <p className="text-base text-[var(--color-foreground)]">
            {posDisplay && <span className="text-[var(--color-muted)]">({posDisplay}) </span>}
            {word.japanese}
          </p>
        </div>

        {/* Example sentence */}
        {word.exampleSentence && (
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
              }} className="shrink-0 mt-1">
                <Icon name="volume_up" size={20} className="text-[var(--color-muted)]" />
              </button>
            </div>
            {word.exampleSentenceJa && (
              <p className="text-sm text-[var(--color-muted)]">{word.exampleSentenceJa}</p>
            )}
          </div>
        )}

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

            {slotItemMap.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)] text-center py-6">
                ＋ボタンからセクションを追加できます
              </p>
            ) : (
              <div ref={swapyContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {slotItemMap.map((entry) => {
                  const section = sectionById.get(entry.item);
                  if (!section) return null;
                  return (
                    <div key={entry.slot} data-swapy-slot={entry.slot}>
                      <div data-swapy-item={entry.item} className="p-4 space-y-2 border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)]">
                        <div className="flex items-center gap-2">
                          <div data-swapy-handle className="cursor-grab active:cursor-grabbing touch-none p-1">
                            <Icon name="drag_indicator" size={18} className="text-[var(--color-muted)]" />
                          </div>
                          <input
                            type="text"
                            value={section.title}
                            onChange={(e) => handleUpdateSection(section.id, 'title', e.target.value)}
                            placeholder="セクション名"
                            className="flex-1 text-sm font-bold text-[var(--color-foreground)] bg-transparent outline-none placeholder:text-[var(--color-muted)]"
                          />
                          <button
                            onClick={() => handleRemoveSection(section.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--color-surface-secondary)]"
                          >
                            <Icon name="close" size={16} className="text-[var(--color-muted)]" />
                          </button>
                        </div>
                        <textarea
                          value={section.content}
                          onChange={(e) => handleUpdateSection(section.id, 'content', e.target.value)}
                          placeholder="内容を入力..."
                          rows={3}
                          className="w-full text-sm text-[var(--color-foreground)] bg-transparent outline-none resize-none placeholder:text-[var(--color-muted)] leading-relaxed"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : orderedSections.length > 0 ? (
          <div className="space-y-5 pt-2">
            {orderedSections.map((section) => (
              <div key={section.id} className="space-y-2">
                <h3 className="text-sm font-bold text-[var(--color-foreground)]">{section.title}</h3>
                <p className="text-sm text-[var(--color-foreground)] leading-relaxed whitespace-pre-wrap">{section.content}</p>
              </div>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
