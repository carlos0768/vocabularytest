'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import type { Word, WordStatus, SubscriptionStatus } from '@/types';

// Hook for managing words within a project
export function useWords(projectId: string | null) {
  const { subscription, loading: authLoading } = useAuth();
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get repository based on subscription status
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Load words for project
  const loadWords = useCallback(async () => {
    if (!projectId) {
      setWords([]);
      setLoading(false);
      return;
    }

    // Wait for auth to be ready
    if (authLoading) return;

    try {
      setLoading(true);
      setError(null);
      const data = await repository.getWords(projectId);
      setWords(data);
    } catch (e) {
      setError('単語の読み込みに失敗しました');
      console.error('Failed to load words:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, repository, authLoading]);

  // Add words (bulk)
  const addWords = useCallback(
    async (
      newWords: Array<{
        english: string;
        japanese: string;
        distractors: string[];
      }>
    ): Promise<Word[]> => {
      if (!projectId) return [];

      try {
        const wordsToCreate = newWords.map((w) => ({
          ...w,
          projectId,
          status: 'new' as WordStatus,
        }));
        const created = await repository.createWords(wordsToCreate);
        setWords((prev) => [...created, ...prev]);
        return created;
      } catch (e) {
        setError('単語の追加に失敗しました');
        console.error('Failed to add words:', e);
        return [];
      }
    },
    [projectId, repository]
  );

  // Update word status
  const updateWordStatus = useCallback(
    async (wordId: string, status: WordStatus): Promise<boolean> => {
      try {
        await repository.updateWord(wordId, { status });
        setWords((prev) =>
          prev.map((w) => (w.id === wordId ? { ...w, status } : w))
        );
        return true;
      } catch (e) {
        console.error('Failed to update word status:', e);
        return false;
      }
    },
    [repository]
  );

  // Update word (for editing)
  const updateWord = useCallback(
    async (
      wordId: string,
      updates: Partial<Pick<Word, 'english' | 'japanese' | 'distractors'>>
    ): Promise<boolean> => {
      try {
        await repository.updateWord(wordId, updates);
        setWords((prev) =>
          prev.map((w) => (w.id === wordId ? { ...w, ...updates } : w))
        );
        return true;
      } catch (e) {
        setError('単語の更新に失敗しました');
        console.error('Failed to update word:', e);
        return false;
      }
    },
    [repository]
  );

  // Delete word
  const deleteWord = useCallback(
    async (wordId: string): Promise<boolean> => {
      try {
        await repository.deleteWord(wordId);
        setWords((prev) => prev.filter((w) => w.id !== wordId));
        return true;
      } catch (e) {
        setError('単語の削除に失敗しました');
        console.error('Failed to delete word:', e);
        return false;
      }
    },
    [repository]
  );

  // Initial load - wait for auth to be ready
  useEffect(() => {
    if (!authLoading) {
      loadWords();
    }
  }, [authLoading, loadWords]);

  // Stats
  const stats = {
    total: words.length,
    new: words.filter((w) => w.status === 'new').length,
    review: words.filter((w) => w.status === 'review').length,
    mastered: words.filter((w) => w.status === 'mastered').length,
  };

  return {
    words,
    loading,
    error,
    stats,
    addWords,
    updateWord,
    updateWordStatus,
    deleteWord,
    refresh: loadWords,
  };
}
