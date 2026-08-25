/**
 * 回答形式 (四択 / 入力) の選択。
 *
 * クイズの解き方 (`quiz-mode-preference`) が端末の既定として一度だけ選ぶものなのに対し、
 * こちらは**クイズを始めるたびに選び直す**。同じ単語帳でも「今日は入力で鍛える」
 * 「電車では四択」とその場で変えたいので、既定へ勝手に倒して選択画面を飛ばさない。
 *
 * localStorage には最後に選んだ側だけを覚える。これは選択画面で「いま」の印を出す
 * ためだけのもので、選択そのものを省略する用途には使わない。
 */

export type QuizAnswerFormat = 'choice' | 'typing';

/** 最後に選んだ形式を入れる localStorage のキー。 */
export const QUIZ_ANSWER_FORMAT_STORAGE_KEY = 'merken_quiz_answer_format';

export function isQuizAnswerFormat(value: unknown): value is QuizAnswerFormat {
  return value === 'choice' || value === 'typing';
}

/** localStorage のうち、この機能が使う部分だけ。テストから差し替えられるようにする。 */
export type QuizAnswerFormatStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * 既定の保存先。
 * SSR では window が無く、Safari のプライベートモードでは localStorage 参照自体が
 * 例外を投げることがあるので、どちらも null に倒して呼び出し側を守る。
 */
export function defaultQuizAnswerFormatStorage(): QuizAnswerFormatStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 前回この端末で選ばれた形式。無ければ null。
 * 選択画面の初期表示に使うだけなので、壊れた値は null 扱いでよい。
 */
export function readLastQuizAnswerFormat(
  storage: QuizAnswerFormatStorage | null = defaultQuizAnswerFormatStorage(),
): QuizAnswerFormat | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(QUIZ_ANSWER_FORMAT_STORAGE_KEY);
    return isQuizAnswerFormat(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** 選ばれた形式を覚える。保存できない環境では黙って諦める。 */
export function writeLastQuizAnswerFormat(
  format: QuizAnswerFormat,
  storage: QuizAnswerFormatStorage | null = defaultQuizAnswerFormatStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(QUIZ_ANSWER_FORMAT_STORAGE_KEY, format);
  } catch {
    // 容量超過やプライベートモード。次回の初期表示が出ないだけで、クイズは解ける。
  }
}

/**
 * この問題を入力で解かせるか。
 *
 * - 語順並べ替えは四択でも入力でもない独立した出題なので、形式の選択では動かさない。
 * - `format` が null なのは、形式を選ぶ前に作られた途中状態 (sessionStorage) を
 *   復元したときだけ。その回は従来どおり単語の性質 (発信語彙・active) で決める。
 */
export function shouldAnswerByTyping(
  format: QuizAnswerFormat | null,
  question: { isWordOrder: boolean; prefersTypeIn: boolean },
): boolean {
  if (question.isWordOrder) return false;
  if (format === 'typing') return true;
  if (format === 'choice') return false;
  return question.prefersTypeIn;
}
