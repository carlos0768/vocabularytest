'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VocabularyAssetDetail } from '@/types';
import { requestJson } from './api-client';

type VocabularyAssetResponse = {
  success: boolean;
} & VocabularyAssetDetail;

type CreateVocabularyAssetInput = {
  title: string;
  collectionId: string;
  iconImage?: string;
};

export function useVocabularyAsset(assetId?: string | null) {
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
      const payload = await requestJson<VocabularyAssetResponse>(`/api/vocabulary-assets/${assetId}`);
      setDetail({
        asset: payload.asset,
        project: payload.project,
        words: payload.words,
        stats: payload.stats,
        idioms: payload.idioms ?? [],
      });
      return payload;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '単語帳アセットの取得に失敗しました。');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [assetId]);

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateVocabularyAssetInput) => {
    try {
      setLoading(true);
      setError(null);
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
  }, []);

  return {
    create,
    loading,
    error,
  };
}
