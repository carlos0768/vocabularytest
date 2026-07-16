'use client';

/**
 * ホームの検索ボタンから開く、自分の単語帳内の単語検索オーバーレイ。
 * 検索対象は自分が持つ単語帳の単語のみ（共有ライブラリは対象外）。
 * データはホームが同期済みの IndexedDB（localRepository）から読む。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { WordDetailView } from '@/components/word/WordDetailView';
import { localRepository } from '@/lib/db/local-repository';
import { getPartOfSpeechLabel } from '@/lib/part-of-speech-labels';
import type { Word } from '@/types';

const MAX_RESULTS = 50;

type SearchEntry = { word: Word; projectTitle: string };

/**
 * 呼び出し側は開くたびに条件付きレンダリング（`{open && <HomeWordSearchSheet/>}`）
 * すること。マウントごとに状態が初期化されるので、開き直しのリセット処理は不要。
 */
export function HomeWordSearchSheet({
  onClose,
  userId,
}: {
  onClose: () => void;
  userId: string;
}) {
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // オーバーレイ表示直後にキーボードを出す。
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50);

    let cancelled = false;
    (async () => {
      try {
        const projects = await localRepository.getProjects(userId);
        const wordsByProject = await localRepository.getAllWordsByProjectIds(
          projects.map((project) => project.id),
        );
        const titleById = new Map(projects.map((project) => [project.id, project.title]));
        const next: SearchEntry[] = [];
        for (const [projectId, words] of Object.entries(wordsByProject)) {
          const projectTitle = titleById.get(projectId) ?? '';
          for (const word of words) {
            next.push({ word, projectTitle });
          }
        }
        if (!cancelled) setEntries(next);
      } catch (loadError) {
        console.error('Failed to load words for home search:', loadError);
        if (!cancelled) setEntries([]);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
    };
  }, [userId]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !entries) return [];
    const matched: SearchEntry[] = [];
    for (const entry of entries) {
      const { word } = entry;
      const haystacks = [
        word.english,
        word.japanese,
        ...(word.translations?.map((t) => t.translationJa) ?? []),
      ];
      if (haystacks.some((value) => value?.toLowerCase().includes(q))) {
        matched.push(entry);
        if (matched.length >= MAX_RESULTS) break;
      }
    }
    return matched;
  }, [entries, query]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[var(--color-background)]" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="flex items-center gap-2 px-[14px] pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex h-[42px] min-w-0 flex-1 items-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3">
          <Icon name="search" size={16} className="shrink-0 text-[var(--color-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="自分の単語帳から検索"
            className="min-w-0 flex-1 bg-transparent text-[14px] font-bold text-[var(--solid-ink)] outline-none placeholder:font-semibold placeholder:text-[var(--color-muted)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="入力をクリア"
              className="shrink-0 text-[var(--color-muted)]"
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-[13px] font-bold text-[var(--solid-ink)]"
        >
          キャンセル
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
        {query.trim() === '' ? (
          <div className="px-2 py-10 text-center text-sm text-[var(--color-muted)]">
            単語（英語・日本語）で検索できます
          </div>
        ) : entries === null ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={18} className="animate-spin" />
            <span className="ml-2 text-sm">読み込み中...</span>
          </div>
        ) : results.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-[var(--color-muted)]">
            一致する単語がありません
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {results.map(({ word, projectTitle }) => {
              const pos = word.partOfSpeechTags?.[0] ?? null;
              return (
                <button
                  key={word.id}
                  type="button"
                  onClick={() => setSelectedWord(word)}
                  className="block w-full px-1 py-2.5 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">
                        {word.english}
                      </div>
                      <div className="mt-px flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                        {pos && (
                          <span className="shrink-0 font-mono text-[9px]">
                            ({getPartOfSpeechLabel(pos).charAt(0)})
                          </span>
                        )}
                        <span className="truncate">
                          <TranslationDisplay word={word} compact />
                        </span>
                      </div>
                    </div>
                    <span className="max-w-[96px] shrink-0 truncate text-[9px] font-bold text-[var(--color-muted)]">
                      {projectTitle}
                    </span>
                    <Icon name="chevron_right" size={14} className="shrink-0 text-[var(--color-muted)]" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedWord && (
        <div className="fixed inset-0 z-[95]">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
            onClick={() => setSelectedWord(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center px-4 py-10" onClick={() => setSelectedWord(null)}>
            <div
              className="w-full overflow-y-auto overscroll-contain"
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
                wordId={selectedWord.id}
                variant="modal"
                initialWord={selectedWord}
                onClose={() => setSelectedWord(null)}
                onWordUpdated={(updated) => {
                  setEntries((prev) =>
                    prev
                      ? prev.map((entry) =>
                          entry.word.id === updated.id ? { ...entry, word: updated } : entry,
                        )
                      : prev,
                  );
                  setSelectedWord(updated);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
