'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { readHideRelatedWords, writeHideRelatedWords } from '@/lib/preferences/related-words-display';

// 設定画面で切り替えたら、開いている詳細画面にも即座に反映するための通知
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

/** 単語詳細の関連語（派生語）を隠すか。端末ごとの設定で、既定は表示。 */
export function useHideRelatedWords(): {
  hideRelatedWords: boolean;
  setHideRelatedWords: (hide: boolean) => void;
} {
  const hideRelatedWords = useSyncExternalStore(subscribe, readHideRelatedWords, () => false);

  const setHideRelatedWords = useCallback((hide: boolean) => {
    writeHideRelatedWords(hide);
    for (const callback of listeners) callback();
  }, []);

  return { hideRelatedWords, setHideRelatedWords };
}
