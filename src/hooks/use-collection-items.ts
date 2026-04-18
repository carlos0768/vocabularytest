'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CollectionItemSummary } from '@/types';
import { useAuth } from './use-auth';
import { requestJson } from './api-client';
import { localRepository } from '@/lib/db/local-repository';
import type { Project } from '@/types';

type CollectionItemsResponse = {
  success: boolean;
  items: CollectionItemSummary[];
};

function buildLocalVocabularyItem(
  collectionId: string,
  sortOrder: number,
  addedAt: string,
  project: Project,
): CollectionItemSummary {
  return {
    collectionId,
    assetId: project.id,
    sortOrder,
    addedAt,
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
    project: {
      id: project.id,
      title: project.title,
      iconImage: project.iconImage,
      sourceLabels: project.sourceLabels ?? [],
      createdAt: project.createdAt,
    },
  };
}

export function useCollectionItems(collectionId?: string | null) {
  const { user, isPro } = useAuth();
  const [items, setItems] = useState<CollectionItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!collectionId) {
      setItems([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (!isPro && user) {
        const collectionProjects = await localRepository.getCollectionProjects(collectionId);
        const projects = await Promise.all(
          collectionProjects.map((item) => localRepository.getProject(item.projectId)),
        );

        const localItems = projects
          .map((project, index) => {
            if (!project) return null;
            const link = collectionProjects[index];
            return buildLocalVocabularyItem(collectionId, link.sortOrder, link.addedAt, project);
          })
          .filter(Boolean) as CollectionItemSummary[];

        setItems(localItems);
        return;
      }

      const payload = await requestJson<CollectionItemsResponse>(`/api/collections/${collectionId}/items`);
      setItems(payload.items ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'フォルダ項目の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [collectionId, isPro, user]);

  const addItem = useCallback(async (assetId: string) => {
    if (!collectionId) {
      throw new Error('collectionId is required');
    }

    if (!isPro && user) {
      await localRepository.addProjectsToCollection(collectionId, [assetId]);
      await refresh();
      return;
    }

    await requestJson<{ success: boolean }>(`/api/collections/${collectionId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assetId }),
    });
    await refresh();
  }, [collectionId, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    items,
    loading,
    error,
    refresh,
    addItem,
  };
}
