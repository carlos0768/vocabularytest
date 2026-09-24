/**
 * クイズの解き方 (四択 / 記述 / 音読チャレンジ) の端末ごとの記憶。
 *
 * 端末によって使い方が変わる ——「電車では四択、家では声で」のように——ので、
 * アカウントではなく端末に紐づける。したがって localStorage に置き、
 * サーバーにもDBにも同期しない。
 *
 * ただし記憶するのは「次に開いたときの初期選択」だけで、既定として
 * 押し付けはしない。解き方はクイズを始めるたびに選び直せる (選択画面は
 * 毎回出す) ので、null は「まだこの端末で選んだことがない = 初期選択なし」
 * を意味するにとどまる。
 */

export type QuizMode = 'normal' | 'typing' | 'voice';

/** 音読チャレンジ (別ページ) ではなく、四択クイズ画面の中で解ける形式。 */
export type QuizAnswerFormat = Exclude<QuizMode, 'voice'>;

/** 端末ごとの選択を入れる localStorage のキー。 */
export const QUIZ_MODE_STORAGE_KEY = 'merken_quiz_mode';

/**
 * 選んだ形式を画面間で受け渡すクエリキー。
 * 音読チャレンジから四択・記述へ戻るときに使い、戻った先で選択画面を
 * もう一度出さないようにする。
 */
export const QUIZ_FORMAT_QUERY_KEY = 'format';

export function isQuizMode(value: unknown): value is QuizMode {
  return value === 'normal' || value === 'typing' || value === 'voice';
}

/** 四択クイズ画面の中で解ける形式か (音読は別ページなので含まない)。 */
export function isQuizAnswerFormat(value: unknown): value is QuizAnswerFormat {
  return value === 'normal' || value === 'typing';
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
 * この端末で前回選ばれた解き方。まだ選んだことがなければ null。
 * 壊れた値が入っていても null 扱いにして、選択画面の初期選択を空にする。
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

/** この端末の解き方を覚える。保存できない環境では黙って諦める。 */
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
