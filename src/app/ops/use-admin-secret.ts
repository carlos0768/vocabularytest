'use client';

import { useCallback, useSyncExternalStore } from 'react';

// /ops 配下のページで ADMIN_SECRET の入力値を共有するためのフック。
// タブを閉じれば消えるよう sessionStorage に保持する(localStorageには置かない)。
// シークレット自体の検証はサーバー(/api/ops/*)が行う。
// use-tour-seen.ts と同じ useSyncExternalStore + リスナー通知パターン。

const STORAGE_KEY = 'merken_ops_admin_secret';

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function emit() {
  for (const callback of listeners) callback();
}

// sessionStorageが使えない環境(プライベートモード等)でも入力欄が
// 動くように、メモリ上のフォールバックを持つ。
let memorySecret = '';

function readSecret(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? memorySecret;
  } catch {
    return memorySecret;
  }
}

export function useAdminSecret(): [string, (value: string) => void] {
  const secret = useSyncExternalStore(subscribe, readSecret, () => '');

  const update = useCallback((value: string) => {
    memorySecret = value;
    try {
      if (value) {
        window.sessionStorage.setItem(STORAGE_KEY, value);
      } else {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ストレージ不可 — メモリフォールバックで続行
    }
    emit();
  }, []);

  return [secret, update];
}
