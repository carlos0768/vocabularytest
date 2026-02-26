'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

interface UserPreferencesState {
  aiEnabled: boolean | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setAiEnabled: (enabled: boolean) => Promise<boolean>;
}

export function useUserPreferences(): UserPreferencesState {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [aiEnabled, setAiEnabledState] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setAiEnabledState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
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
      setAiEnabledState(typeof data.aiEnabled === 'boolean' ? data.aiEnabled : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setAiEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!isAuthenticated) return false;
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
      setAiEnabledState(typeof data.aiEnabled === 'boolean' ? data.aiEnabled : null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  }, [isAuthenticated]);

  return {
    aiEnabled,
    loading,
    saving,
    error,
    refresh,
    setAiEnabled,
  };
}
