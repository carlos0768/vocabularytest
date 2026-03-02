'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const SESSION_CACHE_KEY = 'merken_user_preferences_cache';

interface UserPreferencesCache {
  userId: string;
  aiEnabled: boolean | null;
}

let cache: UserPreferencesCache | null = null;

function readCache(userId: string): boolean | null | undefined {
  if (cache && cache.userId === userId) {
    return cache.aiEnabled;
  }

  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as UserPreferencesCache;
    if (parsed.userId !== userId) return undefined;
    cache = parsed;
    return parsed.aiEnabled;
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, aiEnabled: boolean | null) {
  cache = { userId, aiEnabled };
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

interface UserPreferencesState {
  aiEnabled: boolean | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setAiEnabled: (enabled: boolean) => Promise<boolean>;
}

export function useUserPreferences(): UserPreferencesState {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [aiEnabled, setAiEnabledState] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !user?.id) {
      setAiEnabledState(null);
      setLoading(false);
      setError(null);
      clearCache();
      return;
    }

    const cachedValue = readCache(user.id);
    const hasCachedValue = cachedValue !== undefined;
    if (hasCachedValue) {
      setAiEnabledState(cachedValue);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/user-preferences', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('設定の取得に失敗しました');
      }

      const data = await response.json() as { aiEnabled: boolean | null };
      const normalized = typeof data.aiEnabled === 'boolean' ? data.aiEnabled : null;
      setAiEnabledState(normalized);
      writeCache(user.id, normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setAiEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!isAuthenticated || !user?.id) return false;

    const previousValue = aiEnabled;
    setAiEnabledState(enabled);
    writeCache(user.id, enabled);
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/user-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiEnabled: enabled }),
      });

      if (!response.ok) {
        throw new Error('設定の保存に失敗しました');
      }

      const data = await response.json() as { aiEnabled: boolean | null };
      const normalized = typeof data.aiEnabled === 'boolean' ? data.aiEnabled : null;
      setAiEnabledState(normalized);
      writeCache(user.id, normalized);
      return true;
    } catch (err) {
      setAiEnabledState(previousValue);
      writeCache(user.id, previousValue);
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  }, [aiEnabled, isAuthenticated, user?.id]);

  return {
    aiEnabled,
    loading,
    saving,
    error,
    refresh,
    setAiEnabled,
  };
}
