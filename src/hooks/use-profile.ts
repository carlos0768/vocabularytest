'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const SESSION_CACHE_KEY = 'merken_profile_cache';

interface ProfileCache {
  userId: string;
  username: string | null;
  accountId: string | null;
}

let cache: ProfileCache | null = null;

function readCache(userId: string): Pick<ProfileCache, 'username' | 'accountId'> | undefined {
  if (cache && cache.userId === userId) {
    return { username: cache.username, accountId: cache.accountId };
  }

  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ProfileCache;
    if (parsed.userId !== userId) return undefined;
    cache = {
      userId: parsed.userId,
      username: parsed.username,
      accountId: parsed.accountId ?? null,
    };
    return { username: cache.username, accountId: cache.accountId };
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, username: string | null, accountId: string | null) {
  cache = { userId, username, accountId };
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
  accountId: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setUsername: (username: string) => Promise<boolean>;
}

export function useProfile(): ProfileState {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [username, setUsernameState] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !user?.id) {
      setUsernameState(null);
      setAccountId(null);
      setLoading(false);
      setError(null);
      clearCache();
      return;
    }

    const cachedValue = readCache(user.id);
    const hasCachedValue = cachedValue !== undefined;
    if (hasCachedValue) {
      setUsernameState(cachedValue.username);
      setAccountId(cachedValue.accountId);
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

      const data = await response.json() as { username: string | null; accountId?: string | null };
      const normalized = typeof data.username === 'string' ? data.username : null;
      const normalizedAccountId = typeof data.accountId === 'string' ? data.accountId : null;
      setUsernameState(normalized);
      setAccountId(normalizedAccountId);
      writeCache(user.id, normalized, normalizedAccountId);
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
    const previousAccountId = accountId;
    const trimmed = newUsername.trim();
    setUsernameState(trimmed);
    writeCache(user.id, trimmed, accountId);
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

      const data = await response.json() as { username: string | null; accountId?: string | null };
      const normalized = typeof data.username === 'string' ? data.username : null;
      const normalizedAccountId = typeof data.accountId === 'string' ? data.accountId : accountId;
      setUsernameState(normalized);
      setAccountId(normalizedAccountId);
      writeCache(user.id, normalized, normalizedAccountId);
      return true;
    } catch (err) {
      setUsernameState(previousValue);
      setAccountId(previousAccountId);
      writeCache(user.id, previousValue, previousAccountId);
      setError(err instanceof Error ? err.message : 'ユーザー名の保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  }, [accountId, username, isAuthenticated, user?.id]);

  return {
    username,
    accountId,
    loading,
    saving,
    error,
    refresh,
    setUsername,
  };
}
