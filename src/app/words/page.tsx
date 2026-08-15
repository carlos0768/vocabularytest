'use client';

/**
 * 単語一覧 (/words)。
 * 単語帳の区切りを外して「単語そのもの」を眺めるための画面。
 *
 * 読み込みはページを開いたときの1回だけで、以降の検索・絞り込み・並べ替えは
 * すべてメモリ上のフロントエンド処理で完結する (通信は発生しない)。
 * 通信するのは単語へのアクション (ブックマーク・編集・削除) だけ。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { WordFilterPanel, WordFilterSheet } from '@/components/words/WordFilterPanel';
import { WordRow } from '@/components/project/WordRow';
import { WordListFrame } from '@/components/words/WordListFrame';
import { StackedBar } from '@/components/project/WordStatusBar';
import { Icon } from '@/components/ui/Icon';
import { WordDetailView } from '@/components/word/WordDetailView';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll';
import { usePageScrolled } from '@/hooks/use-page-scrolled';
import { useWordLibrary } from '@/hooks/use-word-library';
import { scheduleWordStatusWrite } from '@/lib/db/debounced-status-write';
import { invalidateHomeCache } from '@/lib/home-cache';
import { getNextVocabularyType } from '@/lib/vocabulary-type';
import {
  DEFAULT_WORD_FILTER,
  SORT_LABELS,
  clearFilterConditions,
  countActiveFilters,
  deriveFilterOptions,
  describeActiveFilters,
  filterAndSortWords,
  summarizeStatuses,
  type SortKey,
  type WordFilterState,
  type WordListEntry,
} from '@/lib/words/word-filter';
import type { Word, WordStatus } from '@/types';

const PAGE_SIZE = 60;

const SORT_KEYS: SortKey[] = [
  'created-desc',
  'created-asc',
  'alpha-asc',
  'alpha-desc',
  'japanese',
  'status',
  'review',
  'project',
  'wrong',
];

export default function WordsPage() {
  const { entries, loading, error, repository, applyWordUpdate, removeWord } = useWordLibrary();
  const pageScrolled = usePageScrolled();
  const [filter, setFilter] = useState<WordFilterState>(DEFAULT_WORD_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedWord, setSelectedWord] = useState<WordListEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WordListEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const options = useMemo(() => deriveFilterOptions(entries), [entries]);
  const results = useMemo(() => filterAndSortWords(entries, filter), [entries, filter]);
  const activeCount = countActiveFilters(filter);
  const activeChips = useMemo(() => describeActiveFilters(filter, options), [filter, options]);
  const statusSummary = useMemo(() => summarizeStatuses(results), [results]);

  // 条件が変わったら先頭から出し直す
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, entries.length]);

  const visible = results.slice(0, visibleCount);
  const hasMore = visibleCount < results.length;
  const sentinelRef = useInfiniteScrollSentinel({
    enabled: hasMore,
    onLoadMore: () => setVisibleCount((count) => count + PAGE_SIZE),
  });

  const handleToggleFavorite = useCallback(
    async (entry: WordListEntry) => {
      const next = !entry.word.isFavorite;
      const updated: Word = { ...entry.word, isFavorite: next };
      applyWordUpdate(updated);
      setSelectedWord((current) =>
        current && current.word.id === entry.word.id ? { ...current, word: updated } : current,
      );
      try {
        await repository.updateWord(entry.word.id, { isFavorite: next });
        invalidateHomeCache();
      } catch (updateError) {
        console.error('Failed to toggle favorite:', updateError);
        applyWordUpdate(entry.word);
        setSelectedWord((current) =>
          current && current.word.id === entry.word.id ? { ...current, word: entry.word } : current,
        );
      }
    },
    [applyWordUpdate, repository],
  );

  // 単語帳詳細と同じ3段チェックボックス。連打はまとめて1回だけ書き込む。
  const handleCycleStatus = useCallback(
    (entry: WordListEntry, newStatus: WordStatus) => {
      const currentStatus = entry.word.status;
      applyWordUpdate({ ...entry.word, status: newStatus });
      scheduleWordStatusWrite({
        wordId: entry.word.id,
        currentStatus,
        newStatus,
        writer: async (finalStatus, originalStatus) => {
          try {
            await repository.updateWord(entry.word.id, { status: finalStatus });
            invalidateHomeCache();
          } catch (updateError) {
            console.error('Failed to update status:', updateError);
            applyWordUpdate({ ...entry.word, status: originalStatus });
          }
        },
      });
    },
    [applyWordUpdate, repository],
  );

  const handleCycleVocabularyType = useCallback(
    async (entry: WordListEntry) => {
      const vocabularyType = getNextVocabularyType(entry.word.vocabularyType);
      const updated: Word = { ...entry.word, vocabularyType };
      applyWordUpdate(updated);
      setSelectedWord((current) =>
        current && current.word.id === entry.word.id ? { ...current, word: updated } : current,
      );
      try {
        await repository.updateWord(entry.word.id, { vocabularyType });
        invalidateHomeCache();
      } catch (updateError) {
        console.error('Failed to update vocabulary type:', updateError);
        applyWordUpdate(entry.word);
        setSelectedWord((current) =>
          current && current.word.id === entry.word.id ? { ...current, word: entry.word } : current,
        );
      }
    },
    [applyWordUpdate, repository],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await repository.deleteWord(deleteTarget.word.id);
      removeWord(deleteTarget.word.id);
      if (selectedWord?.word.id === deleteTarget.word.id) setSelectedWord(null);
      invalidateHomeCache();
      setDeleteTarget(null);
    } catch (deleteError) {
      console.error('Failed to delete word:', deleteError);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, removeWord, repository, selectedWord]);

  const panelProps = {
    filter,
    options,
    onChange: setFilter,
    onClear: () => setFilter((prev) => clearFilterConditions(prev)),
    activeCount,
  };

  return (
    <div
      className="relative flex min-h-screen w-full flex-col bg-[var(--color-background)] pb-32 lg:pb-10"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {/* スクロールしても上部に固定されるヘッダー(単語帳詳細と同じパターン)。
          下線はコンテンツがヘッダの下に潜り込んだときだけ出す。 */}
      <header
        className={`sticky z-40 border-b-2 bg-[var(--color-background)]/95 px-[14px] pb-2.5 pt-2.5 backdrop-blur-md ${
          pageScrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'
        }`}
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-display text-[18px] font-extrabold leading-none tracking-[-0.02em] text-[var(--solid-ink)]">
            単語一覧
          </span>
          <span className="min-w-0 truncate font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
            ALL WORDS
          </span>
          <span className="ml-auto shrink-0 font-mono text-[11px] font-bold tabular-nums text-[var(--color-muted)]">
            <span className="text-[14px] text-[var(--solid-ink)]">{results.length}</span>
            <span> / {entries.length}語</span>
          </span>
        </div>

        {/* 検索・絞り込み・並べ替えを一列に並べる */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border-[1.5px] border-[var(--color-border)] bg-white px-3">
            <Icon name="search" size={16} className="shrink-0 text-[var(--color-muted)]" />
            <input
              value={filter.query}
              onChange={(event) => setFilter((prev) => ({ ...prev, query: event.target.value }))}
              placeholder="単語・意味・例文で検索"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
            />
            {filter.query && (
              <button
                type="button"
                onClick={() => setFilter((prev) => ({ ...prev, query: '' }))}
                aria-label="検索をクリア"
                className="shrink-0 text-[var(--color-muted)]"
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="絞り込み"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] lg:hidden"
          >
            <Icon name="tune" size={17} />
            {activeCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--solid-ink)] px-1 font-mono text-[9.5px] font-bold tabular-nums text-white">
                {activeCount}
              </span>
            )}
          </button>

          {/* 並べ替え: 端末標準のピッカーを出すため select をそのまま重ねる */}
          <label className="relative flex h-10 shrink-0 items-center gap-1.5 rounded-xl border-[1.5px] border-[var(--color-border)] bg-white px-2.5 text-[var(--solid-ink)]">
            <Icon name="swap_vert" size={16} className="shrink-0 text-[var(--color-muted)]" />
            <span className="hidden max-w-[150px] truncate text-[11.5px] font-bold lg:inline">
              {SORT_LABELS[filter.sort]}
            </span>
            <select
              value={filter.sort}
              onChange={(event) =>
                setFilter((prev) => ({ ...prev, sort: event.target.value as SortKey }))
              }
              aria-label="並べ替え"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* 学習度の内訳。単語帳詳細と同じバーを、枠を持たせず背景の上に置く */}
      {results.length > 0 && (
        <div className="px-4 pb-1 pt-3 lg:px-5">
          <StackedBar
            total={results.length}
            m={statusSummary.mastered}
            a={statusSummary.active}
            l={statusSummary.review}
            n={statusSummary.new}
          />
        </div>
      )}

      <div className="px-4 pt-2.5 lg:grid lg:grid-cols-[286px_1fr] lg:items-start lg:gap-6 lg:px-5">
        {/* デスクトップ: 左に絞り込みを常設 */}
        <aside className="sticky top-[104px] hidden max-h-[calc(100dvh-124px)] overflow-y-auto rounded-2xl border-2 border-[var(--solid-ink)] bg-white p-4 lg:block">
          <WordFilterPanel {...panelProps} />
        </aside>

        {/* 横にはみ出させない。sticky なヘッダ/サイドバーの祖先に overflow を
            付けると sticky がその要素基準になって効かなくなるので、
            sticky を含まないこのカラムだけで閉じる。 */}
        <div className="min-w-0 overflow-x-hidden">

          {/* 適用中の条件: 1つずつ外せる */}
          {activeChips.length > 0 && (
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              {activeChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilter(chip.next)}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border-[1.5px] border-[var(--solid-ink)] bg-[var(--solid-ink)] px-[10px] py-[5px] text-[11px] font-bold text-white"
                >
                  <span className="truncate">{chip.label}</span>
                  <Icon name="close" size={12} />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFilter((prev) => clearFilterConditions(prev))}
                className="rounded-full border-[1.5px] border-[var(--color-border)] bg-white px-[10px] py-[5px] text-[11px] font-bold text-[var(--solid-ink)]"
              >
                すべて解除
              </button>
            </div>
          )}

          {error && (
            <p className="mb-2 text-[11px] font-bold text-[var(--color-error)]">{error}</p>
          )}

          {loading ? (
            <div className="divide-y divide-[var(--color-border)]">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <div key={index} className="flex items-center gap-2.5 px-1 py-2.5">
                  <div className="h-[43px] w-[13px] animate-pulse rounded bg-[var(--color-border)]" />
                  <div className="flex-1">
                    <div className="h-[15px] w-1/3 animate-pulse rounded bg-[var(--color-border)]" />
                    <div className="mt-1.5 h-[11px] w-1/2 animate-pulse rounded bg-[var(--color-border)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
              <div className="font-display text-[15px] font-bold text-[var(--solid-ink)]">
                まだ単語がありません
              </div>
              <p className="m-0 mt-2 text-[12px] leading-[1.8] text-[var(--color-muted)]">
                単語帳に単語を追加すると、ここに単語帳をまたいで一覧表示されます。
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
              <div className="font-display text-[15px] font-bold text-[var(--solid-ink)]">
                条件に合う単語がありません
              </div>
              <button
                type="button"
                onClick={() => setFilter(DEFAULT_WORD_FILTER)}
                className="mt-3 h-10 rounded-xl border-2 border-[var(--solid-ink)] bg-white px-5 text-[12.5px] font-bold text-[var(--solid-ink)]"
              >
                条件をすべて解除
              </button>
            </div>
          ) : (
            <>
              {/* 行も枠も単語帳詳細と同じ (区切り線だけの横幅いっぱいの一覧) */}
              <WordListFrame>
                {visible.map((entry) => (
                  <WordRow
                    key={entry.word.id}
                    word={entry.word}
                    selectMode={false}
                    selected={false}
                    wrongCount={entry.wrongCount}
                    onToggleSelect={() => {}}
                    onCycleStatus={(newStatus) => handleCycleStatus(entry, newStatus)}
                    onCycleVocabularyType={() => void handleCycleVocabularyType(entry)}
                    onToggleFavorite={() => void handleToggleFavorite(entry)}
                    onSelect={() => setSelectedWord(entry)}
                  />
                ))}
              </WordListFrame>
              {hasMore && (
                <div ref={sentinelRef} className="flex justify-center py-5 text-[var(--color-muted)]">
                  <Icon name="progress_activity" size={18} className="animate-spin" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <WordFilterSheet
        {...panelProps}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        resultCount={results.length}
      />

      {selectedWord && (
        <div className="fixed inset-0 z-[80]" style={{ fontFamily: 'var(--font-body)' }}>
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,26,26,0.45)' }}
            onClick={() => setSelectedWord(null)}
          />
          <div
            className="absolute inset-0 flex items-center justify-center px-4 py-10"
            onClick={() => setSelectedWord(null)}
          >
            <div
              className="w-full overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
              style={{
                maxWidth: 480,
                maxHeight: '80dvh',
                background: '#faf7f1',
                border: '2px solid var(--solid-ink)',
                borderRadius: 20,
              }}
            >
              <WordDetailView
                wordId={selectedWord.word.id}
                variant="modal"
                initialWord={selectedWord.word}
                onClose={() => setSelectedWord(null)}
                onWordUpdated={(updated) => {
                  applyWordUpdate(updated);
                  setSelectedWord((current) => (current ? { ...current, word: updated } : null));
                }}
                onDelete={(wordId) =>
                  setDeleteTarget(results.find((entry) => entry.word.id === wordId) ?? null)
                }
              />
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
          <button
            type="button"
            aria-label="閉じる"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!deleting) setDeleteTarget(null);
            }}
            style={{ background: 'rgba(26,26,26,0.45)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center px-5">
            <div className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-5">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                DELETE
              </div>
              <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
                単語を削除しますか？
              </h2>
              <p className="mt-2 text-[11px] leading-[1.5] text-[var(--color-muted)]">
                {deleteTarget.word.english} が削除されます。この操作は取り消せません。
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!deleting) setDeleteTarget(null);
                  }}
                  className="h-11 flex-1 rounded-xl border-2 border-[var(--color-border)] bg-white text-[13px] font-bold text-[var(--solid-ink)]"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  disabled={deleting}
                  className="h-11 flex-1 rounded-xl border-2 border-[var(--color-error)] bg-[var(--color-error)] text-[13px] font-bold text-white disabled:opacity-60"
                >
                  {deleting ? '削除中...' : '削除する'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
