'use client';

/**
 * 単語一覧ページ (/words) 用のデータ読み込み。
 *
 * 全単語帳の単語をローカル(IndexedDB)から一度だけ読み出し、あとの絞り込みは
 * すべてメモリ上で行う。そのためフィルタ操作では通信が一切発生しない。
 * (書き込み — ブックマーク・編集・削除 — だけがリポジトリ経由で同期される)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { getGuestUserId, getWrongAnswers } from '@/lib/utils';
import type { WordListEntry } from '@/lib/words/word-filter';
import type { SubscriptionStatus, Word } from '@/types';

type BulkCapableRepository = {
  getAllWordsByProjectIds?: (ids: string[]) => Promise<Record<string, Word[]>>;
  getAllWordsByProject?: (ids: string[]) => Promise<Record<string, Word[]>>;
};

export function useWordLibrary() {
  const { user, subscription, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<WordListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(
    () => getRepository(subscriptionStatus, wasPro),
    [subscriptionStatus, wasPro],
  );

  const load = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError(null);

    try {
      const userId = user ? user.id : getGuestUserId();
      const projects = await repository.getProjects(userId);
      const projectIds = projects.map((project) => project.id);

      const bulkRepository = repository as typeof repository & BulkCapableRepository;
      let wordsByProject: Record<string, Word[]> = {};
      if (projectIds.length === 0) {
        wordsByProject = {};
      } else if (bulkRepository.getAllWordsByProjectIds) {
        wordsByProject = await bulkRepository.getAllWordsByProjectIds(projectIds);
      } else if (bulkRepository.getAllWordsByProject) {
        wordsByProject = await bulkRepository.getAllWordsByProject(projectIds);
      } else {
        const lists = await Promise.all(projectIds.map((id) => repository.getWords(id)));
        wordsByProject = Object.fromEntries(projectIds.map((id, index) => [id, lists[index] ?? []]));
      }

      // クイズの誤答は localStorage 側にあるので、ここで単語に合流させておく
      const wrongCountByWordId = new Map(
        getWrongAnswers().map((wrong) => [wrong.wordId, wrong.wrongCount]),
      );

      const nextEntries: WordListEntry[] = [];
      for (const project of projects) {
        for (const word of wordsByProject[project.id] ?? []) {
          nextEntries.push({
            word,
            projectId: project.id,
            projectTitle: project.title,
            binder: project.binder ?? null,
            wrongCount: wrongCountByWordId.get(word.id) ?? 0,
          });
        }
      }

      setEntries(nextEntries);
    } catch (loadError) {
      console.error('Failed to load word library:', loadError);
      setError('単語の読み込みに失敗しました');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, repository, user]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 詳細モーダルなどで編集された単語を一覧側にも反映する。 */
  const applyWordUpdate = useCallback((updated: Word) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.word.id === updated.id ? { ...entry, word: updated } : entry)),
    );
  }, []);

  const removeWord = useCallback((wordId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.word.id !== wordId));
  }, []);

  return {
    entries,
    loading: loading || authLoading,
    error,
    repository,
    reload: load,
    applyWordUpdate,
    removeWord,
  };
}
