'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import {
  MAX_CUSTOM_SCAN_MODES_PER_USER,
  type CustomScanMode,
} from '@/lib/scan/custom-modes';

interface CustomScanModesState {
  modes: CustomScanMode[];
  loading: boolean;
  error: string | null;
}

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('ログインが必要です');

  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers ?? {}),
    },
  });
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}));
  const error = (body as { error?: unknown }).error;
  return typeof error === 'string' ? error : fallback;
}

/**
 * ユーザ定義の抽出プロンプト（カスタム抽出モード）の一覧・作成・削除。
 * スキャンUIから使う想定なので、取得は開いたときの1回だけ。
 */
export function useCustomScanModes(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled !== false;
  const [state, setState] = useState<CustomScanModesState>({
    modes: [],
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await authorizedFetch('/api/custom-scan-modes');
      if (!response.ok) {
        throw new Error(await readError(response, 'カスタム抽出モードの取得に失敗しました'));
      }
      const body = await response.json();
      const modes = Array.isArray(body?.modes) ? (body.modes as CustomScanMode[]) : [];
      setState({ modes, loading: false, error: null });
    } catch (error) {
      setState({
        modes: [],
        loading: false,
        error: error instanceof Error ? error.message : 'カスタム抽出モードの取得に失敗しました',
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const createMode = useCallback(async (input: { name: string; prompt: string }) => {
    const response = await authorizedFetch('/api/custom-scan-modes', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(await readError(response, 'カスタム抽出モードの保存に失敗しました'));
    }
    const body = await response.json();
    const mode = body?.mode as CustomScanMode | undefined;
    if (!mode) throw new Error('カスタム抽出モードの保存に失敗しました');

    setState((prev) => ({ ...prev, modes: [mode, ...prev.modes] }));
    return mode;
  }, []);

  const deleteMode = useCallback(async (id: string) => {
    const response = await authorizedFetch(`/api/custom-scan-modes/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(await readError(response, 'カスタム抽出モードの削除に失敗しました'));
    }
    setState((prev) => ({ ...prev, modes: prev.modes.filter((mode) => mode.id !== id) }));
  }, []);

  return {
    modes: state.modes,
    loading: state.loading,
    error: state.error,
    limit: MAX_CUSTOM_SCAN_MODES_PER_USER,
    canSaveMore: state.modes.length < MAX_CUSTOM_SCAN_MODES_PER_USER,
    refresh,
    createMode,
    deleteMode,
  };
}
