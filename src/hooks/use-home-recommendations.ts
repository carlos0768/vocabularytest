'use client';

/**
 * ホームのおすすめ（共有単語帳）を取得するフック。
 * 毎ナビゲーションで叩くとAPIコストが嵩むため、use-my-groups と同様に
 * モジュールレベルのキャッシュでSPAセッション中は1回だけフェッチする。
 *
 * リールはホームから外したので `reels=0` で取得する（サーバー側は limit 0 で
 * リール用のクエリを丸ごとスキップする）。/reels 本体は従来どおり
 * /api/reels/feed を使うため影響を受けない。
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { HomeRecommendationsPayload } from '@/lib/home/recommendations-types';

type HomeRecommendations = Pick<HomeRecommendationsPayload, 'books'>;

type HomeRecommendationsApiResponse = Partial<HomeRecommendationsPayload> & {
  success?: boolean;
  error?: string;
};

const EMPTY: HomeRecommendations = { books: [] };

let cached: HomeRecommendations | null = null;
let inflight: Promise<HomeRecommendations> | null = null;

async function fetchRecommendations(): Promise<HomeRecommendations> {
  const response = await fetch('/api/home/recommendations?reels=0', { cache: 'no-store' });
  const payload = await response.json().catch(() => null) as HomeRecommendationsApiResponse | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'home_recommendations_failed');
  }
  return { books: payload.books ?? [] };
}

function loadRecommendations(): Promise<HomeRecommendations> {
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

export function useHomeRecommendations(): HomeRecommendations & { loading: boolean } {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [fetched, setFetched] = useState<HomeRecommendations | null>(cached);

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
  return { books: payload.books, loading };
}
