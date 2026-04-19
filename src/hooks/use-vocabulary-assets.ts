'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VocabularyAssetDetail } from '@/types';
import { useAuth } from './use-auth';
import { requestJson } from './api-client';
import { localRepository } from '@/lib/db/local-repository';
import type { Project, Word } from '@/types';

type VocabularyAssetResponse = {
  success: boolean;
} & VocabularyAssetDetail;

type CreateVocabularyAssetInput = {
  title: string;
  collectionId: string;
  iconImage?: string;
};

function buildLocalVocabularyStats(words: Word[]) {
  return {
    totalWords: words.length,
    newWords: words.filter((word) => word.status === 'new').length,
    reviewWords: words.filter((word) => word.status === 'review').length,
    masteredWords: words.filter((word) => word.status === 'mastered').length,
    activeWords: words.filter((word) => word.vocabularyType === 'active').length,
    passiveWords: words.filter((word) => word.vocabularyType === 'passive').length,
    exampleCount: words.filter((word) => Boolean(word.exampleSentence?.trim())).length,
  };
}

function buildLocalIdioms(words: Word[]) {
  return words
    .map((word) => word.english.trim())
    .filter((english) => /\s/.test(english))
    .filter((english, index, list) => list.indexOf(english) === index);
}

function buildLocalVocabularyAssetDetail(project: Project, words: Word[]): VocabularyAssetResponse {
  const stats = buildLocalVocabularyStats(words);
  return {
    success: true,
    asset: {
      id: project.id,
      userId: project.userId,
      kind: 'vocabulary_project',
      title: project.title,
      status: 'ready',
      legacyProjectId: project.id,
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
    },
    project,
    words,
    stats,
    idioms: buildLocalIdioms(words),
    flashcardProgress: {
      reviewed: stats.reviewWords + stats.masteredWords,
      total: stats.totalWords,
    },
  };
}

export function useVocabularyAsset(assetId?: string | null) {
  const { isPro, user } = useAuth();
  const [detail, setDetail] = useState<VocabularyAssetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!assetId) {
      setDetail(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (!isPro) {
        const project = await localRepository.getProject(assetId);
        if (project) {
          const words = await localRepository.getWords(project.id);
          const payload = buildLocalVocabularyAssetDetail(project, words);
          setDetail({
            asset: payload.asset,
            project: payload.project,
            words: payload.words,
            stats: payload.stats,
            idioms: payload.idioms ?? [],
            lastQuizAccuracy: payload.lastQuizAccuracy,
            flashcardProgress: payload.flashcardProgress,
          });
          return payload;
        }

        if (!user) {
          throw new Error('単語帳が見つかりません。');
        }
      }

      const payload = await requestJson<VocabularyAssetResponse>(`/api/vocabulary-assets/${assetId}`);
      setDetail({
        asset: payload.asset,
        project: payload.project,
        words: payload.words,
        stats: payload.stats,
        idioms: payload.idioms ?? [],
        lastQuizAccuracy: payload.lastQuizAccuracy,
        flashcardProgress: payload.flashcardProgress,
      });
      return payload;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '単語帳アセットの取得に失敗しました。');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [assetId, isPro, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    detail,
    loading,
    error,
    refresh,
  };
}

export function useCreateVocabularyAsset() {
  const { isPro, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateVocabularyAssetInput) => {
    try {
      setLoading(true);
      setError(null);

      if (!isPro && user) {
        const project = await localRepository.createProject({
          userId: user.id,
          title: input.title,
          iconImage: input.iconImage,
          sourceLabels: [],
        });
        await localRepository.addProjectsToCollection(input.collectionId, [project.id]);
        return buildLocalVocabularyAssetDetail(project, []);
      }

      return await requestJson<VocabularyAssetResponse>('/api/vocabulary-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '単語帳の作成に失敗しました。');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [isPro, user]);

  return {
    create,
    loading,
    error,
  };
}
