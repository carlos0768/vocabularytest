'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { normalizeStoredAvatarUrl } from '@/lib/profile/avatar';

const SESSION_CACHE_KEY = 'merken_profile_cache';

interface ProfileCache {
  userId: string;
  username: string | null;
  accountId: string | null;
  avatarUrl: string | null;
}

/** 表示に使うプロフィール値。API・キャッシュ・楽観更新で共通の形。 */
type ProfileValues = Omit<ProfileCache, 'userId'>;

const EMPTY_VALUES: ProfileValues = { username: null, accountId: null, avatarUrl: null };

let cache: ProfileCache | null = null;

function readCache(userId: string): ProfileValues | undefined {
  if (cache && cache.userId === userId) {
    return { username: cache.username, accountId: cache.accountId, avatarUrl: cache.avatarUrl };
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
      avatarUrl: parsed.avatarUrl ?? null,
    };
    return { username: cache.username, accountId: cache.accountId, avatarUrl: cache.avatarUrl };
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, values: ProfileValues) {
  cache = { userId, ...values };
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore(アイコンを含むためクォータ超過もあり得るが、表示自体には影響しない)
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

type ProfileApiResponse = {
  username?: string | null;
  accountId?: string | null;
  avatarUrl?: string | null;
};

/** API レスポンスを表示値へ。返ってこなかった項目は手元の値を維持する。 */
function mergeApiResponse(data: ProfileApiResponse, current: ProfileValues): ProfileValues {
  return {
    username: typeof data.username === 'string' ? data.username : null,
    accountId: typeof data.accountId === 'string' ? data.accountId : current.accountId,
    avatarUrl: data.avatarUrl === undefined
      ? current.avatarUrl
      : normalizeStoredAvatarUrl(data.avatarUrl),
  };
}

interface ProfileState {
  username: string | null;
  accountId: string | null;
  /** アカウントアイコンの data URL。未設定なら null。 */
  avatarUrl: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setUsername: (username: string) => Promise<boolean>;
  setAccountId: (accountId: string) => Promise<boolean>;
  /** null を渡すとアイコンを削除する。 */
  setAvatarUrl: (avatarUrl: string | null) => Promise<boolean>;
}

export function useProfile(): ProfileState {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [values, setValues] = useState<ProfileValues>(EMPTY_VALUES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !user?.id) {
      setValues(EMPTY_VALUES);
      setLoading(false);
      setError(null);
      clearCache();
      return;
    }

    const cachedValue = readCache(user.id);
    if (cachedValue) {
      setValues(cachedValue);
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

      const data = await response.json() as ProfileApiResponse;
      const next = mergeApiResponse(data, cachedValue ?? EMPTY_VALUES);
      setValues(next);
      writeCache(user.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プロフィールの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * 楽観的にローカル状態を更新してから PUT し、失敗したら元の値へ戻す共通処理。
   * `optimistic` は送信内容を画面へ即反映するための差分。
   */
  const save = useCallback(async (
    body: Record<string, string | null>,
    optimistic: Partial<ProfileValues>,
    failureMessage: string,
  ): Promise<boolean> => {
    if (!isAuthenticated || !user?.id) return false;

    const userId = user.id;
    // ロールバック用の値はレンダー時のスナップショットから取る。state 更新関数の
    // 中で控えると StrictMode の二重実行で「楽観更新後の値」を拾ってしまう。
    const previous = values;
    const optimisticValues = { ...previous, ...optimistic };
    setValues(optimisticValues);
    writeCache(userId, optimisticValues);
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? failureMessage);
      }

      const data = await response.json() as ProfileApiResponse;
      const next = mergeApiResponse(data, optimisticValues);
      setValues(next);
      writeCache(userId, next);
      return true;
    } catch (err) {
      setValues(previous);
      writeCache(userId, previous);
      setError(err instanceof Error ? err.message : failureMessage);
      return false;
    } finally {
      setSaving(false);
    }
  }, [isAuthenticated, user?.id, values]);

  const setUsername = useCallback(async (newUsername: string): Promise<boolean> => {
    const trimmed = newUsername.trim();
    return save({ username: trimmed }, { username: trimmed }, 'ユーザー名の保存に失敗しました');
  }, [save]);

  const setAccountId = useCallback(async (newAccountId: string): Promise<boolean> => {
    const trimmed = newAccountId.trim();
    return save({ accountId: trimmed }, { accountId: trimmed }, 'IDの保存に失敗しました');
  }, [save]);

  const setAvatarUrl = useCallback(async (newAvatarUrl: string | null): Promise<boolean> => {
    const normalized = newAvatarUrl ? normalizeStoredAvatarUrl(newAvatarUrl) : null;
    if (newAvatarUrl && !normalized) {
      setError('アイコン画像の形式が不正です');
      return false;
    }
    return save(
      { avatarUrl: normalized },
      { avatarUrl: normalized },
      normalized ? 'アイコンの保存に失敗しました' : 'アイコンの削除に失敗しました',
    );
  }, [save]);

  return {
    username: values.username,
    accountId: values.accountId,
    avatarUrl: values.avatarUrl,
    loading,
    saving,
    error,
    refresh,
    setUsername,
    setAccountId,
    setAvatarUrl,
  };
}
