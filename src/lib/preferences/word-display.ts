/**
 * 単語詳細・フラッシュカードで隠す項目の設定。
 *
 * 表示の好みなのでアカウントではなく端末に紐づけ、localStorage に置く
 * （1日の復習上限・目標と同じ扱い。DB マイグレーションは要らない）。
 * 既定はどれも表示。
 */

export const HIDEABLE_WORD_SECTIONS = ['relatedWords', 'etymology'] as const;
export type HideableWordSection = (typeof HIDEABLE_WORD_SECTIONS)[number];

/** relatedWords のキーは最初に出した設定のまま（既存ユーザーの設定を引き継ぐ） */
export const WORD_SECTION_STORAGE_KEYS: Record<HideableWordSection, string> = {
  relatedWords: 'merken_hide_related_words',
  etymology: 'merken_hide_etymology',
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function getStorage(): StorageLike | null {
  // SSR では window が無く、Safari のプライベートモードでは参照自体が投げる
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readHideWordSection(
  section: HideableWordSection,
  storage: StorageLike | null = getStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(WORD_SECTION_STORAGE_KEYS[section]) === '1';
  } catch {
    return false;
  }
}

export function writeHideWordSection(
  section: HideableWordSection,
  hide: boolean,
  storage: StorageLike | null = getStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(WORD_SECTION_STORAGE_KEYS[section], hide ? '1' : '0');
  } catch {
    // 保存できない環境（プライベートモードなど）では設定が効かないだけで、画面は壊さない
  }
}
