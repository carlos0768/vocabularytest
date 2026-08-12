/**
 * クイズ形式 (通常クイズ / 音読チャレンジ) の端末ごとの記憶。
 *
 * 端末によって使い方が変わる ——「電車では四択、家では声で」のように——ので、
 * アカウントではなく端末に紐づける。したがって localStorage に置き、
 * サーバーにもDBにも同期しない。
 *
 * 未選択 (null) は「まだこの端末で選んでいない」を意味し、
 * 呼び出し側はクイズを始める前に選択画面を出す。既定値へ勝手に倒さないこと。
 */

export type QuizMode = 'normal' | 'voice';

/** 端末ごとの選択を入れる localStorage のキー。 */
export const QUIZ_MODE_STORAGE_KEY = 'merken_quiz_mode';

export function isQuizMode(value: unknown): value is QuizMode {
  return value === 'normal' || value === 'voice';
}

/** localStorage のうち、この機能が使う部分だけ。テストから差し替えられるようにする。 */
export type QuizModeStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * 既定の保存先。
 * SSR では window が無く、Safari のプライベートモードでは localStorage 参照自体が
 * 例外を投げることがあるので、どちらも null に倒して呼び出し側を守る。
 */
export function defaultQuizModeStorage(): QuizModeStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * この端末で選ばれているクイズ形式。まだ選んでいなければ null。
 * 壊れた値が入っていても null 扱いにして、選択画面からやり直させる。
 */
export function readQuizMode(
  storage: QuizModeStorage | null = defaultQuizModeStorage(),
): QuizMode | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(QUIZ_MODE_STORAGE_KEY);
    return isQuizMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** この端末のクイズ形式を覚える。保存できない環境では黙って諦める。 */
export function writeQuizMode(
  mode: QuizMode,
  storage: QuizModeStorage | null = defaultQuizModeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(QUIZ_MODE_STORAGE_KEY, mode);
  } catch {
    // 容量超過やプライベートモード。記憶できないだけで、クイズは続けられる。
  }
}
