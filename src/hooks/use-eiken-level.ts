'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase';

const SESSION_CACHE_KEY = 'merken_eiken_level_cache';

export const EIKEN_LEVEL_VALUES = ['5', '4', '3', 'pre2', '2', 'pre1', '1'] as const;

interface EikenLevelCache {
  userId: string;
  eikenLevel: string | null;
}

let cache: EikenLevelCache | null = null;

function normalizeEikenLevel(value: unknown): string | null {
  return typeof value === 'string' && (EIKEN_LEVEL_VALUES as readonly string[]).includes(value)
    ? value
    : null;
}

function readCache(userId: string): EikenLevelCache | undefined {
  if (cache && cache.userId === userId) return cache;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as EikenLevelCache;
    if (parsed.userId !== userId) return undefined;
    cache = { userId: parsed.userId, eikenLevel: normalizeEikenLevel(parsed.eikenLevel) };
    return cache;
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, eikenLevel: string | null) {
  cache = { userId, eikenLevel };
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

/**
 * サインアップ時に選んだ英検級（profiles.eiken_level）。
 *
 * 多義語クイズの語義フィルタ（易しすぎる語義を出題しない）に使う。
 * プロフィールは「Anyone can view profiles」の公開SELECTなので、ブラウザ
 * クライアントから自分の行をそのまま読める。未設定・未ログインなら null で、
 * その場合フィルタは無効（全語義を出題）になる。
 */
export function useEikenLevel(): { eikenLevel: string | null; loading: boolean } {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [eikenLevel, setEikenLevel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !userId) {
      setEikenLevel(null);
      setLoading(false);
      return;
    }

    const cached = readCache(userId);
    if (cached) {
      setEikenLevel(cached.eikenLevel);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await createBrowserClient()
          .from('profiles')
          .select('eiken_level')
          .eq('user_id', userId)
          .maybeSingle<{ eiken_level: string | null }>();
        if (cancelled) return;
        // 取得できない場合はフィルタ無効（null）で先に進む。出題が消える方が損失が大きい。
        const level = error ? null : normalizeEikenLevel(data?.eiken_level);
        setEikenLevel(level);
        if (!error) writeCache(userId, level);
      } catch {
        if (!cancelled) setEikenLevel(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, userId]);

  return { eikenLevel, loading };
}
