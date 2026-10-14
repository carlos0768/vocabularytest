/**
 * フラッシュカードの見せ方。
 *
 * - `card`: 1枚ずつ裏返すカード (横スワイプ・前へ/次へで送る)
 * - `reel`: 縦に流すリール (上下スワイプで送り、タップで意味を出す)
 *
 * どちらで見るかは端末の好みなので、アカウントではなく localStorage に置く。
 */

export type FlashcardView = 'card' | 'reel';

export const FLASHCARD_VIEWS: { key: FlashcardView; label: string; icon: string }[] = [
  { key: 'card', label: 'カード', icon: 'style' },
  { key: 'reel', label: 'リール', icon: 'view_day' },
];

export const FLASHCARD_VIEW_STORAGE_KEY = 'merken_flashcard_view';

export function isFlashcardView(value: unknown): value is FlashcardView {
  return value === 'card' || value === 'reel';
}

export type FlashcardViewStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** SSR では window が無く、Safari のプライベートモードでは参照自体が例外を投げうる。 */
function defaultStorage(): FlashcardViewStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** この端末で前回選んだ見せ方。未選択・壊れた値はカードに倒す。 */
export function readFlashcardView(
  storage: FlashcardViewStorage | null = defaultStorage(),
): FlashcardView {
  if (!storage) return 'card';
  try {
    const stored = storage.getItem(FLASHCARD_VIEW_STORAGE_KEY);
    return isFlashcardView(stored) ? stored : 'card';
  } catch {
    return 'card';
  }
}

export function saveFlashcardView(
  view: FlashcardView,
  storage: FlashcardViewStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(FLASHCARD_VIEW_STORAGE_KEY, view);
  } catch {
    /* 保存できなくても今回の表示は切り替わる */
  }
}

/**
 * リールのスクロール位置から、いま画面に止まっているカードの番号を出す。
 * 高さが測れていない (0) ときや山札が空のときは 0。
 */
export function reelIndexFromScroll(scrollTop: number, panelHeight: number, total: number): number {
  if (panelHeight <= 0 || total <= 0) return 0;
  const index = Math.round(scrollTop / panelHeight);
  return Math.min(Math.max(index, 0), total - 1);
}
