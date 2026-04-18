'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CorrectionReviewItem, CorrectionReviewQueueItem } from '@/types';
import { requestJson } from './api-client';

type ReviewQueueResponse = {
  success: boolean;
  items: CorrectionReviewQueueItem[];
};

type ReviewAnswerResponse = {
  success: boolean;
  reviewItem: CorrectionReviewItem;
};

type ReviewFilters = {
  collectionId?: string;
  status?: 'due' | 'new' | 'review';
};

export function useCorrectionReviewQueue(filters: ReviewFilters = {}) {
  const [items, setItems] = useState<CorrectionReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.collectionId) params.set('collectionId', filters.collectionId);
    if (filters.status) params.set('status', filters.status);
    const query = params.toString();

    try {
      setLoading(true);
      setError(null);
      const payload = await requestJson<ReviewQueueResponse>(`/api/review/corrections${query ? `?${query}` : ''}`);
      setItems(payload.items ?? []);
      return payload;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '添削復習キューの取得に失敗しました。');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [filters.collectionId, filters.status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    items,
    loading,
    error,
    refresh,
  };
}

export function useAnswerCorrectionReview() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = useCallback(async (reviewItemId: string, isCorrect: boolean) => {
    try {
      setLoading(true);
      setError(null);
      return await requestJson<ReviewAnswerResponse>('/api/review/corrections/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reviewItemId, isCorrect }),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '復習回答の送信に失敗しました。');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    answer,
    loading,
    error,
  };
}
