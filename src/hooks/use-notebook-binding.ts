'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CollectionNotebookBinding } from '@/types';
import { requestJson } from './api-client';

type NotebookBindingResponse = {
  success: boolean;
  binding: CollectionNotebookBinding | null;
};

type CreateNotebookBindingInput = {
  wordbookAssetId: string;
  structureAssetId?: string;
  correctionAssetId?: string;
};

type UpdateNotebookBindingInput = {
  wordbookAssetId?: string;
  structureAssetId?: string | null;
  correctionAssetId?: string | null;
};

export function useNotebookBinding(
  collectionId?: string | null,
  args?: { wordbookAssetId?: string | null; assetId?: string | null },
) {
  const [binding, setBinding] = useState<CollectionNotebookBinding | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (args?.wordbookAssetId) params.set('wordbookAssetId', args.wordbookAssetId);
    if (args?.assetId) params.set('assetId', args.assetId);
    return params.toString();
  }, [args?.assetId, args?.wordbookAssetId]);

  const refresh = useCallback(async () => {
    if (!collectionId || !queryString) {
      setBinding(null);
      return null;
    }

    try {
      setLoading(true);
      setError(null);
      const payload = await requestJson<NotebookBindingResponse>(
        `/api/collections/${collectionId}/notebook-binding?${queryString}`,
      );
      setBinding(payload.binding);
      return payload.binding;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'ノート関連付けの取得に失敗しました。');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [collectionId, queryString]);

  const create = useCallback(async (input: CreateNotebookBindingInput) => {
    if (!collectionId) {
      throw new Error('collectionId is required');
    }

    const payload = await requestJson<NotebookBindingResponse>(`/api/collections/${collectionId}/notebook-binding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    setBinding(payload.binding);
    return payload.binding;
  }, [collectionId]);

  const update = useCallback(async (bindingId: string, input: UpdateNotebookBindingInput) => {
    if (!collectionId) {
      throw new Error('collectionId is required');
    }

    const payload = await requestJson<NotebookBindingResponse>(
      `/api/collections/${collectionId}/notebook-binding/${bindingId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
    );
    setBinding(payload.binding);
    return payload.binding;
  }, [collectionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    binding,
    loading,
    error,
    refresh,
    create,
    update,
  };
}
