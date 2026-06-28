'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { useToast } from '@/components/ui/toast';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { WordFilterSheet, WordSortSheet } from '@/components/project/WordListSheets';
import { useAuth } from '@/hooks/use-auth';
import { getRepository, hybridRepository } from '@/lib/db';
import { localRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import { scheduleWordStatusWrite } from '@/lib/db/debounced-status-write';
import { invalidateHomeCache } from '@/lib/home-cache';
import { markProjectVisited } from '@/lib/project-visit';
import { getNextVocabularyType } from '@/lib/vocabulary-type';
import { getGuestUserId } from '@/lib/utils';
import { groupWordsByMemory, summarizeWordMemory, type WordMemoryGroup } from '@/lib/words/memory';
import type { Project, SubscriptionStatus, Word, WordStatus } from '@/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

function isOwnedBy(project: Project | undefined | null, expectedUserId: string): project is Project {
  return Boolean(project && project.userId === expectedUserId);
}

const POS_JP: Record<string, string> = {
  noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
  preposition: '前置詞', conjunction: '接続詞', pronoun: '代名詞',
  interjection: '感動詞', determiner: '限定詞', auxiliary: '助動詞',
  phrase: '句', idiom: 'イディオム', phrasal_verb: '句動詞', other: 'その他',
};

function posShort(tag: string): string {
  const jp = POS_JP[tag] ?? tag;
  return `(${jp[0]})`;
}

function StackedBar({ total, m, a, l, n }: { total: number; m: number; a: number; l: number; n: number }) {
  const pctM = total ? (m / total) * 100 : 0;
  const pctA = total ? (a / total) * 100 : 0;
  const pctL = total ? (l / total) * 100 : 0;
  const pctN = total ? (n / total) * 100 : 0;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-white">
        <div style={{ width: `${pctM}%`, background: 'var(--color-success)' }} />
        <div style={{ width: `${pctA}%`, background: '#2563eb' }} />
        <div style={{ width: `${pctL}%`, background: 'var(--color-warning)' }} />
        <div style={{ width: `${pctN}%`, background: 'rgba(26,26,26,0.12)' }} />
      </div>
      <div className="mt-[7px] flex flex-wrap gap-3.5">
        {[['var(--color-success)', '習得', m], ['#2563eb', '定着中', a], ['var(--color-warning)', '学習中', l], ['rgba(26,26,26,0.35)', '未学習', n]].map(([color, label, count]) => (
          <span key={label as string} className="inline-flex items-center gap-[5px]">
            <span className="h-[7px] w-[7px] rounded-[3.5px]" style={{ background: color as string }} />
            <span className="text-[11px] font-semibold text-[#4a4a4a]">{label as string}</span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">{count as number}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const SS_FILLED: Record<WordStatus, number> = { new: 0, review: 1, active: 2, mastered: 3 };
const SS_STATUS: WordStatus[] = ['new', 'review', 'active', 'mastered'];
const SS_ARIA: Record<WordStatus, string> = { new: '未学習', review: '学習中', active: '定着中', mastered: '習得済み' };

function StatusSquares({ wordId, status, onStatusChange }: {
  wordId: string; status: WordStatus; onStatusChange: (s: WordStatus) => void;
}) {
  const [filledCount, setFilledCount] = useState(() => SS_FILLED[status] ?? 0);
  const [direction, setDirection] = useState<'up' | 'down'>(() => status === 'mastered' ? 'down' : 'up');

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setFilledCount(SS_FILLED[status] ?? 0);
      setDirection(status === 'mastered' ? 'down' : 'up');
    });
    return () => { cancelled = true; };
  }, [status, wordId]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'up') {
      if (filledCount < 3) {
        const next = filledCount + 1;
        setFilledCount(next);
        if (next === 3) setDirection('down');
        onStatusChange(SS_STATUS[next]);
      }
    } else {
      if (filledCount > 0) {
        const next = filledCount - 1;
        setFilledCount(next);
        if (next === 0) setDirection('up');
        onStatusChange(SS_STATUS[next]);
      }
    }
  }, [filledCount, direction, onStatusChange]);

  return (
    <button type="button" onClick={handleClick}
      aria-label={`ステータス: ${SS_ARIA[status] ?? status}`}
      className="shrink-0 rounded transition-colors active:bg-[rgba(26,26,26,0.06)]"
    >
      <div className="flex flex-col gap-[1.5px]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[13px] w-[13px] rounded-[2.5px] border-2 border-[var(--solid-ink)]"
            style={{ background: i < filledCount ? 'var(--solid-ink)' : 'transparent' }} />
        ))}
      </div>
    </button>
  );
}

function WordRow({ word, memoryGroup, onCycleStatus, onCycleVocabularyType, onToggleFavorite }: {
  word: Word;
  memoryGroup?: WordMemoryGroup<Word>;
  onCycleStatus: (s: WordStatus) => void;
  onCycleVocabularyType: () => void;
  onToggleFavorite: () => void;
}) {
  const pos = word.partOfSpeechTags?.[0] ?? null;
  const displayStatus = memoryGroup?.status ?? word.status;
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
      <div className="relative rounded-xl border-2 border-[var(--solid-ink)] bg-white px-[13px] py-2">
        <div className="flex items-center gap-2.5">
          <StatusSquares wordId={word.id} status={displayStatus} onStatusChange={onCycleStatus} />
          <Link href={`/word/${word.id}?from=${encodeURIComponent('/projects')}`} className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{word.english}</div>
            <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
              {pos && <span className="shrink-0 font-mono text-[9px]">{posShort(pos)}</span>}
              <span className="truncate">
                <TranslationDisplay word={word} compact />
              </span>
              {memoryGroup?.isDistinctGroup && (
                <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums">
                  {memoryGroup.memoryRate}%
                </span>
              )}
            </div>
          </Link>
          <VocabularyTypeButton vocabularyType={word.vocabularyType} onClick={onCycleVocabularyType} className="shrink-0" />
          <button type="button" onClick={onToggleFavorite} className="inline-flex text-[var(--color-accent)]" aria-label="お気に入りを切り替え">
            <Icon name="bookmark" size={18} filled={word.isFavorite} />
          </button>
        </div>
      </div>
    </div>
  );
}

type SortOrder = 'createdAsc' | 'alphabetical' | 'statusAsc';

export function ProjectDetailSheet({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { user, subscription, isPro: _isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [wordSortOrder, setWordSortOrder] = useState<SortOrder>('createdAsc');
  const [wordShowSortSheet, setWordShowSortSheet] = useState(false);
  const [wordShowFilterSheet, setWordShowFilterSheet] = useState(false);
  const [wordFilterBookmark, setWordFilterBookmark] = useState(false);
  const [wordFilterActiveness, setWordFilterActiveness] = useState<'all' | 'active' | 'passive'>('all');
  const [wordFilterPos, setWordFilterPos] = useState<string | null>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);
  const mutationRepository = useMemo(
    () => (subscriptionStatus === 'active' ? hybridRepository : repository),
    [repository, subscriptionStatus],
  );

  const loadProject = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);

    try {
      const expectedUserId = user ? user.id : getGuestUserId();
      let loadedProject: Project | undefined;
      let loadedWords: Word[] = [];

      try {
        const localProject = await localRepository.getProject(projectId);
        if (isOwnedBy(localProject, expectedUserId)) {
          loadedProject = localProject;
          setProject(localProject);
          setLoading(false);
          loadedWords = await localRepository.getWords(projectId);
          setWords(loadedWords);
          setWordsLoaded(true);
        }
      } catch (e) { console.error('Local load failed:', e); }

      if (user && navigator.onLine) {
        try {
          const remoteProject = await remoteRepository.getProject(projectId);
          if (isOwnedBy(remoteProject, user.id)) {
            loadedProject = remoteProject;
            setProject(remoteProject);
            setLoading(false);
            setWordsLoaded(false);
            loadedWords = await remoteRepository.getWords(projectId);
            setWords(loadedWords);
            setWordsLoaded(true);
          }
        } catch (e) {
          console.error('Remote load failed:', e);
          setWordsLoaded(true);
        }
      }

      if (!loadedProject) {
        const fallback = await repository.getProject(projectId);
        if (isOwnedBy(fallback, expectedUserId)) {
          setProject(fallback);
          loadedWords = await repository.getWords(projectId);
          setWords(loadedWords);
          setWordsLoaded(true);
        }
      }
    } catch (e) {
      console.error('Failed to load project:', e);
    } finally {
      setLoading(false);
      setWordsLoaded(true);
    }
  }, [authLoading, projectId, repository, user]);

  useEffect(() => { void loadProject(); }, [loadProject]);
  useEffect(() => { if (project?.id) markProjectVisited(project.id); }, [project?.id]);

  const counts = useMemo(() => {
    const summary = summarizeWordMemory(words);
    return {
      total: summary.total,
      mastered: summary.mastered,
      active: summary.active,
      learning: summary.learning,
      newCount: summary.unlearned,
    };
  }, [words]);

  const wordFilterActive = wordFilterBookmark || wordFilterActiveness !== 'all' || wordFilterPos !== null;

  const availablePartsOfSpeech = useMemo(() => {
    const set = new Set<string>();
    for (const w of words) for (const tag of w.partOfSpeechTags ?? []) set.add(tag);
    return [...set].sort();
  }, [words]);

  const filteredWords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let base = normalized
      ? words.filter((w) => w.english.toLowerCase().includes(normalized) || w.japanese.toLowerCase().includes(normalized))
      : words;
    if (wordFilterBookmark) base = base.filter((w) => w.isFavorite);
    if (wordFilterActiveness !== 'all') base = base.filter((w) => w.vocabularyType === wordFilterActiveness);
    if (wordFilterPos) base = base.filter((w) => w.partOfSpeechTags?.includes(wordFilterPos!));
    if (wordSortOrder === 'alphabetical') return [...base].sort((a, b) => a.english.localeCompare(b.english));
    if (wordSortOrder === 'statusAsc') {
      const rank = (s: string) => (s === 'new' ? 0 : s === 'review' ? 1 : 2);
      return [...base].sort((a, b) => rank(a.status) - rank(b.status));
    }
    return base;
  }, [query, words, wordSortOrder, wordFilterBookmark, wordFilterActiveness, wordFilterPos]);
  const filteredWordGroups = useMemo(() => groupWordsByMemory(filteredWords), [filteredWords]);

  const handleCycleStatus = (wordId: string, newStatus: WordStatus) => {
    const word = words.find((w) => w.id === wordId);
    if (!word) return;
    const currentStatus = word.status;
    setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, status: newStatus } : w)));
    scheduleWordStatusWrite({
      wordId, currentStatus, newStatus,
      writer: async (finalStatus, originalStatus) => {
        try { await mutationRepository.updateWord(wordId, { status: finalStatus }); }
        catch {
          setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, status: originalStatus } : w)));
          showToast({ message: 'ステータスの更新に失敗しました', type: 'error' });
        }
      },
    });
  };

  const handleCycleVocabularyType = async (word: Word) => {
    const next = getNextVocabularyType(word.vocabularyType);
    setWords((prev) => prev.map((w) => (w.id === word.id ? { ...w, vocabularyType: next } : w)));
    try { await mutationRepository.updateWord(word.id, { vocabularyType: next }); invalidateHomeCache(); }
    catch { setWords((prev) => prev.map((w) => (w.id === word.id ? word : w))); }
  };

  const handleToggleFavorite = async (word: Word) => {
    const isFavorite = !word.isFavorite;
    setWords((prev) => prev.map((w) => (w.id === word.id ? { ...w, isFavorite } : w)));
    try { await mutationRepository.updateWord(word.id, { isFavorite }); invalidateHomeCache(); }
    catch { setWords((prev) => prev.map((w) => (w.id === word.id ? word : w))); }
  };

  const bg = project ? thumbColor(project.id) : '#888';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onClose}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />

      {/* Sheet */}
      <div
        className="relative w-full animate-fade-in-up"
        style={{
          background: '#faf7f1',
          border: '2px solid var(--solid-ink)',
          borderBottomWidth: 0,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
        </div>

        {/* Header: project info + close */}
        <div className="flex items-start gap-3 px-5 pb-3 pt-2">
          <div
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[12px] border-2 bg-center bg-cover font-display text-[22px] font-extrabold text-white"
            style={{
              backgroundColor: bg,
              backgroundImage: project?.iconImage ? `url(${project.iconImage})` : undefined,
              borderColor: 'var(--solid-ink)',
              boxShadow: '2px 2px 0 var(--solid-ink)',
            }}
          >
            {!project?.iconImage && (project?.title.charAt(0) ?? '')}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="font-mono text-[10px] font-semibold tracking-[0.04em] text-[var(--color-muted)]">
              BOOK · {counts.total} words
            </div>
            {loading && !project ? (
              <div className="mt-1 h-5 w-32 animate-pulse rounded bg-[rgba(26,26,26,0.08)]" />
            ) : (
              <h2 className="mt-0.5 font-display text-[20px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[var(--solid-ink)]">
                {project?.title ?? ''}
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="mt-0.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overscroll-contain" style={{ flex: 1 }}>
          {/* Stats bar */}
          {project && (
            <div className="px-5 pb-3">
              <StackedBar total={counts.total} m={counts.mastered} a={counts.active} l={counts.learning} n={counts.newCount} />
            </div>
          )}

          {/* Action buttons */}
          {project && (
            <div className="flex gap-2 px-[18px] pb-4">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--color-accent)]" style={{ transform: 'translate(2px, 2px)' }} />
                <Link
                  href={`/quiz/${projectId}`}
                  className="relative flex w-full items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--color-accent)] bg-[var(--color-accent)] py-[11px] text-[13px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
                >
                  <Icon name="check" size={14} />
                  クイズを始める
                </Link>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
                <Link
                  href={`/flashcard/${projectId}`}
                  className="relative flex items-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-[14px] py-[11px] text-[13px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
                >
                  <Icon name="style" size={14} />
                  カード
                </Link>
              </div>
            </div>
          )}

          {/* Word list controls */}
          <div className="flex items-center justify-between px-5 pb-2">
            <div className="flex gap-1.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="単語を検索"
                className="w-[130px] rounded-full border-2 border-[var(--color-border)] bg-white px-3 py-1.5 text-[12px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {(wordFilterActive || query) && (
                <span className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">
                  {filteredWordGroups.length}/{counts.total}
                </span>
              )}
              <button type="button" onClick={() => setWordShowFilterSheet(true)} aria-label="フィルタ"
                className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 transition-colors ${wordFilterActive ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white' : 'border-[var(--color-border)] bg-white text-[var(--color-muted)]'}`}>
                <Icon name="filter_list" size={15} />
              </button>
              <button type="button" onClick={() => setWordShowSortSheet(true)} aria-label="並べ替え"
                className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 transition-colors ${wordSortOrder !== 'createdAsc' ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white' : 'border-[var(--color-border)] bg-white text-[var(--color-muted)]'}`}>
                <Icon name="swap_vert" size={15} />
              </button>
            </div>
          </div>

          {/* Word list */}
          <div className="flex flex-col gap-2 px-4 pb-[max(32px,env(safe-area-inset-bottom))]">
            {!wordsLoaded ? (
              <div className="flex items-center justify-center py-12 text-[var(--color-muted)]">
                <Icon name="progress_activity" size={20} className="animate-spin" />
                <span className="ml-2 text-sm">単語を読み込み中...</span>
              </div>
            ) : filteredWordGroups.length === 0 ? (
              <div className="rounded-xl border-2 border-[var(--color-border)] bg-white px-4 py-10 text-center text-sm text-[var(--color-muted)]">
                {query ? '一致する単語がありません' : '単語がありません'}
              </div>
            ) : (
              filteredWordGroups.map((group) => {
                const word = group.representative;
                return (
                <WordRow
                  key={group.key}
                  word={word}
                  memoryGroup={group}
                  onCycleStatus={(s) => group.words.forEach((item) => handleCycleStatus(item.id, s))}
                  onCycleVocabularyType={() => void handleCycleVocabularyType(word)}
                  onToggleFavorite={() => void handleToggleFavorite(word)}
                />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Filter / Sort sheets — rendered outside the scrollable area */}
      <WordFilterSheet
        open={wordShowFilterSheet}
        onClose={() => setWordShowFilterSheet(false)}
        bookmark={wordFilterBookmark}
        onBookmarkChange={setWordFilterBookmark}
        activeness={wordFilterActiveness}
        onActivenessChange={setWordFilterActiveness}
        pos={wordFilterPos}
        onPosChange={setWordFilterPos}
        availablePartsOfSpeech={availablePartsOfSpeech}
        hasActiveFilters={wordFilterActive}
        onReset={() => { setWordFilterBookmark(false); setWordFilterActiveness('all'); setWordFilterPos(null); }}
      />
      <WordSortSheet
        open={wordShowSortSheet}
        onClose={() => setWordShowSortSheet(false)}
        sortOrder={wordSortOrder}
        onSortOrderChange={setWordSortOrder}
      />
    </div>
  );
}
