'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CollectionItemSummary } from '@/types';
import { requestJson } from './api-client';

type CollectionItemsResponse = {
  success: boolean;
  items: CollectionItemSummary[];
};

export function useCollectionItems(collectionId?: string | null) {
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
      const payload = await requestJson<CollectionItemsResponse>(`/api/collections/${collectionId}/items`);
      setItems(payload.items ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'フォルダ項目の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  const addItem = useCallback(async (assetId: string) => {
    if (!collectionId) {
      throw new Error('collectionId is required');
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
