/**
 * 単語詳細の「関連語（派生語）」を隠すかどうかの設定。
 *
 * 表示の好みなのでアカウントではなく端末に紐づけ、localStorage に置く
 * （1日の復習上限・目標と同じ扱い。DB マイグレーションは要らない）。
 * 既定は表示。
 */

export const HIDE_RELATED_WORDS_STORAGE_KEY = 'merken_hide_related_words';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function getStorage(): StorageLike | null {
  // SSR では window が無く、Safari のプライベートモードでは参照自体が投げる
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readHideRelatedWords(storage: StorageLike | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(HIDE_RELATED_WORDS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeHideRelatedWords(hide: boolean, storage: StorageLike | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(HIDE_RELATED_WORDS_STORAGE_KEY, hide ? '1' : '0');
  } catch {
    // 保存できない環境（プライベートモードなど）では設定が効かないだけで、画面は壊さない
  }
}
