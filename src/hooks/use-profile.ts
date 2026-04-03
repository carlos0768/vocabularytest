'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const SESSION_CACHE_KEY = 'merken_profile_cache';

interface ProfileCache {
  userId: string;
  username: string | null;
}

let cache: ProfileCache | null = null;

function readCache(userId: string): string | null | undefined {
  if (cache && cache.userId === userId) {
    return cache.username;
  }

  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ProfileCache;
    if (parsed.userId !== userId) return undefined;
    cache = parsed;
    return parsed.username;
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, username: string | null) {
  cache = { userId, username };
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function clearCache() {
  cache = null;
  try {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // ignore
  }
}

interface ProfileState {
  username: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setUsername: (username: string) => Promise<boolean>;
}

export function useProfile(): ProfileState {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [username, setUsernameState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !user?.id) {
      setUsernameState(null);
      setLoading(false);
      setError(null);
      clearCache();
      return;
    }

    const cachedValue = readCache(user.id);
    const hasCachedValue = cachedValue !== undefined;
    if (hasCachedValue) {
      setUsernameState(cachedValue);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('プロフィールの取得に失敗しました');
      }

      const data = await response.json() as { username: string | null };
      const normalized = typeof data.username === 'string' ? data.username : null;
      setUsernameState(normalized);
      writeCache(user.id, normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プロフィールの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setUsername = useCallback(async (newUsername: string): Promise<boolean> => {
    if (!isAuthenticated || !user?.id) return false;

    const previousValue = username;
    const trimmed = newUsername.trim();
    setUsernameState(trimmed);
    writeCache(user.id, trimmed);
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? 'ユーザー名の保存に失敗しました');
      }

      const data = await response.json() as { username: string | null };
      const normalized = typeof data.username === 'string' ? data.username : null;
      setUsernameState(normalized);
      writeCache(user.id, normalized);
      return true;
    } catch (err) {
      setUsernameState(previousValue);
      writeCache(user.id, previousValue);
      setError(err instanceof Error ? err.message : 'ユーザー名の保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  }, [username, isAuthenticated, user?.id]);

  return {
    username,
    loading,
    saving,
    error,
    refresh,
    setUsername,
  };
}
