'use client';

/**
 * 自分の単語帳内の単語検索の共有ロジック。
 * 検索対象は自分が持つ単語帳の単語のみ（共有ライブラリは対象外）。
 * データはホームが同期済みの IndexedDB（localRepository）から読む。
 * モバイルの HomeWordSearchSheet とデスクトップの DesktopWordSearchOverlay で共用。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { localRepository } from '@/lib/db/local-repository';
import type { Word } from '@/types';

const MAX_RESULTS = 50;

export type MyWordSearchEntry = { word: Word; projectTitle: string };

export function useMyWordSearch(userId: string) {
  // null = 読み込み中
  const [entries, setEntries] = useState<MyWordSearchEntry[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const projects = await localRepository.getProjects(userId);
        const wordsByProject = await localRepository.getAllWordsByProjectIds(
          projects.map((project) => project.id),
        );
        const titleById = new Map(projects.map((project) => [project.id, project.title]));
        const next: MyWordSearchEntry[] = [];
        for (const [projectId, words] of Object.entries(wordsByProject)) {
          const projectTitle = titleById.get(projectId) ?? '';
          for (const word of words) {
            next.push({ word, projectTitle });
          }
        }
        if (!cancelled) setEntries(next);
      } catch (loadError) {
        console.error('Failed to load words for my-word search:', loadError);
        if (!cancelled) setEntries([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !entries) return [];
    const matched: MyWordSearchEntry[] = [];
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

  /** 詳細モーダルで単語が編集されたとき、検索結果側にも反映する。 */
  const updateEntryWord = useCallback((updated: Word) => {
    setEntries((prev) =>
      prev
        ? prev.map((entry) =>
            entry.word.id === updated.id ? { ...entry, word: updated } : entry,
          )
        : prev,
    );
  }, []);

  return { entries, query, setQuery, results, updateEntryWord };
}
