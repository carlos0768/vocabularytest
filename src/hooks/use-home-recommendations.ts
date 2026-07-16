'use client';

/**
 * ホームのおすすめ（共有単語帳 + 語源ありリールプレビュー）を取得するフック。
 * 毎ナビゲーションで叩くとAPIコストが嵩むため、use-my-groups と同様に
 * モジュールレベルのキャッシュでSPAセッション中は1回だけフェッチする。
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { HomeRecommendationsPayload } from '@/lib/home/recommendations-types';

type HomeRecommendationsApiResponse = Partial<HomeRecommendationsPayload> & {
  success?: boolean;
  error?: string;
};

const EMPTY: HomeRecommendationsPayload = { books: [], reels: [] };

let cached: HomeRecommendationsPayload | null = null;
let inflight: Promise<HomeRecommendationsPayload> | null = null;

async function fetchRecommendations(): Promise<HomeRecommendationsPayload> {
  const response = await fetch('/api/home/recommendations', { cache: 'no-store' });
  const payload = await response.json().catch(() => null) as HomeRecommendationsApiResponse | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'home_recommendations_failed');
  }
  return { books: payload.books ?? [], reels: payload.reels ?? [] };
}

function loadRecommendations(): Promise<HomeRecommendationsPayload> {
  if (cached !== null) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetchRecommendations()
      .then((payload) => {
        cached = payload;
        return payload;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useHomeRecommendations(): HomeRecommendationsPayload & { loading: boolean } {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [fetched, setFetched] = useState<HomeRecommendationsPayload | null>(cached);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    loadRecommendations()
      .then((payload) => {
        if (!cancelled) setFetched(payload);
      })
      .catch((error) => {
        console.warn('Failed to load home recommendations:', error);
        if (!cancelled) setFetched((current) => current ?? EMPTY);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  const payload = !authLoading && isAuthenticated && fetched ? fetched : EMPTY;
  const loading = authLoading || (isAuthenticated && fetched === null);
  return { books: payload.books, reels: payload.reels, loading };
}
