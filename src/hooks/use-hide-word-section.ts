'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  readHideWordSection,
  writeHideWordSection,
  type HideableWordSection,
} from '@/lib/preferences/word-display';

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

/** 単語の表示項目（関連語・語源）を隠すか。端末ごとの設定で、既定は表示。 */
export function useHideWordSection(section: HideableWordSection): {
  hidden: boolean;
  setHidden: (hide: boolean) => void;
} {
  const hidden = useSyncExternalStore(subscribe, () => readHideWordSection(section), () => false);

  const setHidden = useCallback(
    (hide: boolean) => {
      writeHideWordSection(section, hide);
      for (const callback of listeners) callback();
    },
    [section],
  );

  return { hidden, setHidden };
}
