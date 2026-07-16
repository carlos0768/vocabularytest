'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReelFeedPage, ReelFeedUsage, ReelItem } from '@/lib/reels/types';

export type ReelFeedStatus = 'loading' | 'ready' | 'error';

/** Feed entry with a client-unique key — the same word may legitimately
 * reappear later in a session once the pool recycles. */
export type ReelFeedItem = ReelItem & { feedKey: string };

type FeedResponse = ReelFeedPage & { success: boolean; error?: string };

function reelFeedUrl(cursor: string | null, pin: string | null): string {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (pin) params.set('pin', pin);
  return `/api/reels/feed?${params.toString()}`;
}

// タップ〜画面表示の間にAPI往復を先行させる先読みエントリ。フィードAPIは
// 無料枠を消費するため、呼ぶのは「ユーザーがリールへ遷移し始めた瞬間」
// （ナビのタップ / ホームのリールカードのタップ）だけにすること。
const PREFETCH_TTL_MS = 30_000;
let prefetchEntry: { key: string; startedAt: number; promise: Promise<Response> } | null = null;

/** リール画面への遷移開始時に呼ぶと、初回ページの取得を先行開始する。 */
export function prefetchReelFeed(pin: string | null = null): void {
  const key = pin ?? '';
  if (
    prefetchEntry
    && prefetchEntry.key === key
    && Date.now() - prefetchEntry.startedAt < PREFETCH_TTL_MS
  ) {
    return;
  }
  const promise = fetch(reelFeedUrl(null, pin), { cache: 'no-store' });
  prefetchEntry = { key, startedAt: Date.now(), promise };
  promise.catch(() => {
    prefetchEntry = null;
  });
}

function consumePrefetchedReelFeed(pin: string | null): Promise<Response> | null {
  if (!prefetchEntry) return null;
  if (prefetchEntry.key !== (pin ?? '')) return null;
  if (Date.now() - prefetchEntry.startedAt >= PREFETCH_TTL_MS) {
    prefetchEntry = null;
    return null;
  }
  const { promise } = prefetchEntry;
  // Response body は一度しか読めないので、消費したら必ず破棄する。
  prefetchEntry = null;
  return promise;
}

export function useReelFeed(options: { pin?: string | null } = {}) {
  const [items, setItems] = useState<ReelFeedItem[]>([]);
  const [status, setStatus] = useState<ReelFeedStatus>('loading');
  const [usage, setUsage] = useState<ReelFeedUsage | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const fetchingRef = useRef(false);
  const feedSequenceRef = useRef(0);
  // pin はマウント時の値で固定（クエリ変化での再フェッチループを避ける）。
  const pinRef = useRef(options.pin ?? null);

  const fetchPage = useCallback(async (cursor: string | null, replace: boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      // pin は最初のページにだけ適用する（以降のページは通常ランキング）。
      const pin = cursor ? null : pinRef.current;
      const prefetched = cursor ? null : consumePrefetchedReelFeed(pin);
      const response = await (prefetched ?? fetch(reelFeedUrl(cursor, pin), { cache: 'no-store' }));
      if (!response.ok) {
        throw new Error(`feed_request_failed_${response.status}`);
      }
      const payload = (await response.json()) as FeedResponse;
      if (!payload.success) {
        throw new Error(payload.error || 'feed_failed');
      }
      const keyed: ReelFeedItem[] = payload.items.map((item) => {
        feedSequenceRef.current += 1;
        return { ...item, feedKey: `${item.id}#${feedSequenceRef.current}` };
      });
      setItems((prev) => (replace ? keyed : [...prev, ...keyed]));
      setUsage(payload.usage);
      setLimitReached(payload.limitReached);
      nextCursorRef.current = payload.nextCursor;
      setHasMore(Boolean(payload.nextCursor));
      setStatus('ready');
    } catch (error) {
      console.error('Failed to load reel feed:', error);
      setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchPage(null, true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!nextCursorRef.current || fetchingRef.current) return;
    void fetchPage(nextCursorRef.current, false);
  }, [fetchPage]);

  const retry = useCallback(() => {
    setStatus('loading');
    void fetchPage(nextCursorRef.current, items.length === 0);
  }, [fetchPage, items.length]);

  const likeItem = useCallback(async (item: ReelItem) => {
    const nextLiked = !item.likedByMe;
    // Optimistic flip; rolled back below on failure.
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              likedByMe: nextLiked,
              likeCount: Math.max(0, entry.likeCount + (nextLiked ? 1 : -1)),
            }
          : entry,
      ),
    );
    try {
      const response = await fetch('/api/reels/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: item.source, wordId: item.wordId, liked: nextLiked }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        liked?: boolean;
        likeCount?: number;
      };
      if (!response.ok || !payload.success) {
        throw new Error('like_failed');
      }
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? { ...entry, likedByMe: payload.liked ?? nextLiked, likeCount: payload.likeCount ?? entry.likeCount }
            : entry,
        ),
      );
      return true;
    } catch (error) {
      console.error('Failed to toggle reel like:', error);
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                likedByMe: item.likedByMe,
                likeCount: item.likeCount,
              }
            : entry,
        ),
      );
      return false;
    }
  }, []);

  const markBookImported = useCallback((bookId: string) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.book.id === bookId
          ? { ...entry, book: { ...entry.book, importedByMe: true } }
          : entry,
      ),
    );
  }, []);

  const markWordSaved = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === itemId ? { ...entry, savedByMe: true } : entry,
      ),
    );
  }, []);

  const bumpCommentCount = useCallback((itemId: string, delta: number) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === itemId
          ? { ...entry, commentCount: Math.max(0, entry.commentCount + delta) }
          : entry,
      ),
    );
  }, []);

  return {
    items,
    status,
    usage,
    limitReached,
    hasMore,
    loadMore,
    retry,
    likeItem,
    markBookImported,
    markWordSaved,
    bumpCommentCount,
  };
}
