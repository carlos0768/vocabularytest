'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  DEFAULT_STUDY_REMINDER_TIMES,
  DEFAULT_STUDY_REMINDER_TIMEZONE,
  isSupportedTimeZone,
  normalizeStudyReminderTimes,
  type StudyReminderTime,
} from '@/lib/notifications/study-reminders';

const SESSION_CACHE_KEY = 'merken_user_preferences_cache';

interface UserPreferencesCache {
  userId: string;
  aiEnabled: boolean | null;
  studyReminderEnabled: boolean;
  studyReminderTimes: StudyReminderTime[];
  studyReminderTimezone: string;
}

interface UserPreferencesSnapshot {
  aiEnabled: boolean | null;
  studyReminderEnabled: boolean;
  studyReminderTimes: StudyReminderTime[];
  studyReminderTimezone: string;
}

type UserPreferencesResponse = {
  aiEnabled: boolean | null;
  studyReminderEnabled?: boolean | null;
  studyReminderTimes?: unknown;
  studyReminderTimezone?: string | null;
}

let cache: UserPreferencesCache | null = null;

function getDefaultSnapshot(): UserPreferencesSnapshot {
  return {
    aiEnabled: null,
    studyReminderEnabled: false,
    studyReminderTimes: [...DEFAULT_STUDY_REMINDER_TIMES],
    studyReminderTimezone: DEFAULT_STUDY_REMINDER_TIMEZONE,
  };
}

function normalizeSnapshot(data: UserPreferencesResponse | null): UserPreferencesSnapshot {
  if (!data) return getDefaultSnapshot();
  return {
    aiEnabled: typeof data.aiEnabled === 'boolean' ? data.aiEnabled : null,
    studyReminderEnabled: data.studyReminderEnabled === true,
    studyReminderTimes: normalizeStudyReminderTimes(data.studyReminderTimes),
    studyReminderTimezone: isSupportedTimeZone(data.studyReminderTimezone)
      ? data.studyReminderTimezone
      : DEFAULT_STUDY_REMINDER_TIMEZONE,
  };
}

function readCache(userId: string): UserPreferencesSnapshot | undefined {
  if (cache && cache.userId === userId) {
    return {
      aiEnabled: cache.aiEnabled,
      studyReminderEnabled: cache.studyReminderEnabled,
      studyReminderTimes: normalizeStudyReminderTimes(cache.studyReminderTimes),
      studyReminderTimezone: isSupportedTimeZone(cache.studyReminderTimezone)
        ? cache.studyReminderTimezone
        : DEFAULT_STUDY_REMINDER_TIMEZONE,
    };
  }

  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as UserPreferencesCache;
    if (parsed.userId !== userId) return undefined;
    const snapshot = normalizeSnapshot(parsed);
    cache = { userId, ...snapshot };
    return snapshot;
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, snapshot: UserPreferencesSnapshot) {
  cache = { userId, ...snapshot };
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
  studyReminderEnabled: boolean;
  studyReminderTimes: StudyReminderTime[];
  studyReminderTimezone: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setAiEnabled: (enabled: boolean) => Promise<boolean>;
  setStudyReminders: (preferences: {
    enabled?: boolean;
    times?: StudyReminderTime[];
    timeZone?: string;
  }) => Promise<boolean>;
}

export function useUserPreferences(): UserPreferencesState {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [aiEnabled, setAiEnabledState] = useState<boolean | null>(null);
  const [studyReminderEnabled, setStudyReminderEnabledState] = useState(false);
  const [studyReminderTimes, setStudyReminderTimesState] = useState<StudyReminderTime[]>(() => [
    ...DEFAULT_STUDY_REMINDER_TIMES,
  ]);
  const [studyReminderTimezone, setStudyReminderTimezoneState] = useState(DEFAULT_STUDY_REMINDER_TIMEZONE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((snapshot: UserPreferencesSnapshot) => {
    setAiEnabledState(snapshot.aiEnabled);
    setStudyReminderEnabledState(snapshot.studyReminderEnabled);
    setStudyReminderTimesState(snapshot.studyReminderTimes);
    setStudyReminderTimezoneState(snapshot.studyReminderTimezone);
  }, []);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !user?.id) {
      applySnapshot(getDefaultSnapshot());
      setLoading(false);
      setError(null);
      clearCache();
      return;
    }

    const cachedValue = readCache(user.id);
    const hasCachedValue = cachedValue !== undefined;
    if (hasCachedValue) {
      applySnapshot(cachedValue);
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

      const data = await response.json() as UserPreferencesResponse;
      const normalized = normalizeSnapshot(data);
      applySnapshot(normalized);
      writeCache(user.id, normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setAiEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!isAuthenticated || !user?.id) return false;

    const previousValue = aiEnabled;
    const previousSnapshot: UserPreferencesSnapshot = {
      aiEnabled,
      studyReminderEnabled,
      studyReminderTimes,
      studyReminderTimezone,
    };
    const nextSnapshot = {
      ...previousSnapshot,
      aiEnabled: enabled,
    };
    setAiEnabledState(enabled);
    writeCache(user.id, nextSnapshot);
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

      const data = await response.json() as UserPreferencesResponse;
      const normalized = normalizeSnapshot(data);
      applySnapshot(normalized);
      writeCache(user.id, normalized);
      return true;
    } catch (err) {
      setAiEnabledState(previousValue);
      writeCache(user.id, previousSnapshot);
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    aiEnabled,
    applySnapshot,
    isAuthenticated,
    studyReminderEnabled,
    studyReminderTimes,
    studyReminderTimezone,
    user?.id,
  ]);

  const setStudyReminders = useCallback(async (preferences: {
    enabled?: boolean;
    times?: StudyReminderTime[];
    timeZone?: string;
  }): Promise<boolean> => {
    if (!isAuthenticated || !user?.id) return false;

    const previousSnapshot: UserPreferencesSnapshot = {
      aiEnabled,
      studyReminderEnabled,
      studyReminderTimes,
      studyReminderTimezone,
    };
    const nextSnapshot: UserPreferencesSnapshot = {
      ...previousSnapshot,
      studyReminderEnabled: preferences.enabled ?? previousSnapshot.studyReminderEnabled,
      studyReminderTimes: preferences.times
        ? normalizeStudyReminderTimes(preferences.times)
        : previousSnapshot.studyReminderTimes,
      studyReminderTimezone: isSupportedTimeZone(preferences.timeZone)
        ? preferences.timeZone
        : previousSnapshot.studyReminderTimezone,
    };

    applySnapshot(nextSnapshot);
    writeCache(user.id, nextSnapshot);
    setSaving(true);
    setError(null);

    const body: {
      studyReminderEnabled?: boolean;
      studyReminderTimes?: StudyReminderTime[];
      studyReminderTimezone?: string;
    } = {};
    if (preferences.enabled !== undefined) body.studyReminderEnabled = nextSnapshot.studyReminderEnabled;
    if (preferences.times !== undefined) body.studyReminderTimes = nextSnapshot.studyReminderTimes;
    if (preferences.timeZone !== undefined) body.studyReminderTimezone = nextSnapshot.studyReminderTimezone;

    try {
      const response = await fetch('/api/user-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('通知設定の保存に失敗しました');
      }

      const data = await response.json() as UserPreferencesResponse;
      const normalized = normalizeSnapshot(data);
      applySnapshot(normalized);
      writeCache(user.id, normalized);
      return true;
    } catch (err) {
      applySnapshot(previousSnapshot);
      writeCache(user.id, previousSnapshot);
      setError(err instanceof Error ? err.message : '通知設定の保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    aiEnabled,
    applySnapshot,
    isAuthenticated,
    studyReminderEnabled,
    studyReminderTimes,
    studyReminderTimezone,
    user?.id,
  ]);

  return {
    aiEnabled,
    studyReminderEnabled,
    studyReminderTimes,
    studyReminderTimezone,
    loading,
    saving,
    error,
    refresh,
    setAiEnabled,
    setStudyReminders,
  };
}
