/**
 * クイズの解き方 (四択 / 記述 / 言い換え / 音読チャレンジ) の端末ごとの記憶。
 *
 * 端末によって使い方が変わる ——「電車では四択、家では声で」のように——ので、
 * アカウントではなく端末に紐づける。したがって localStorage に置き、
 * サーバーにもDBにも同期しない。
 *
 * 選択画面は**その日最初のクイズでだけ**出す。一度選んだら、同じ日
 * (JSTの暦日) のうちはその解き方でそのまま始め、選択画面は出さない
 * (`readTodaysQuizMode`)。日付が変わったら、前回の選択は選択画面の
 * 初期選択に使うだけに戻る (`readQuizMode`)。途中で変えたければ、
 * クイズ画面右上の切り替えからいつでも選び直せる。
 */

export type QuizMode = 'normal' | 'typing' | 'paraphrase' | 'voice';

/**
 * 音読チャレンジ (別ページ) ではなく、四択クイズ画面の中で解ける形式。
 * `paraphrase` は英語 → 英語の同義語を 4 択で選ぶ言い換えクイズ (出題材料はオープンデータ)。
 */
export type QuizAnswerFormat = Exclude<QuizMode, 'voice'>;

/** 端末ごとの選択を入れる localStorage のキー。 */
export const QUIZ_MODE_STORAGE_KEY = 'merken_quiz_mode';

/** 解き方を選んだ日 (JSTの `YYYY-MM-DD`) を入れる localStorage のキー。 */
export const QUIZ_MODE_CHOSEN_ON_STORAGE_KEY = 'merken_quiz_mode_chosen_on';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 「その日」を決める日付キー。JSTの暦日 (`YYYY-MM-DD`)。
 * 端末の時計のタイムゾーンに左右されないよう、対戦の無料枠やコインの月境界と
 * 同じく JST で切る。
 */
export function quizModeDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 選んだ形式を画面間で受け渡すクエリキー。
 * 音読チャレンジから四択・記述へ戻るときに使い、戻った先で選択画面を
 * もう一度出さないようにする。
 */
export const QUIZ_FORMAT_QUERY_KEY = 'format';

export function isQuizMode(value: unknown): value is QuizMode {
  return isQuizAnswerFormat(value) || value === 'voice';
}

/** 四択クイズ画面の中で解ける形式か (音読は別ページなので含まない)。 */
export function isQuizAnswerFormat(value: unknown): value is QuizAnswerFormat {
  return value === 'normal' || value === 'typing' || value === 'paraphrase';
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

/**
 * 今日すでに選ばれた解き方。今日まだ選んでいなければ null (= 選択画面を出す)。
 * 選んだ日が記録されていない (この機能より前に保存された) 値も null にする。
 */
export function readTodaysQuizMode(
  storage: QuizModeStorage | null = defaultQuizModeStorage(),
  now: Date = new Date(),
): QuizMode | null {
  const mode = readQuizMode(storage);
  if (!mode || !storage) return null;
  try {
    return storage.getItem(QUIZ_MODE_CHOSEN_ON_STORAGE_KEY) === quizModeDayKey(now) ? mode : null;
  } catch {
    return null;
  }
}

/**
 * この端末の解き方を、選んだ日といっしょに覚える。
 * 保存できない環境では黙って諦める (毎回選択画面が出るだけ)。
 */
export function writeQuizMode(
  mode: QuizMode,
  storage: QuizModeStorage | null = defaultQuizModeStorage(),
  now: Date = new Date(),
): void {
  if (!storage) return;
  try {
    storage.setItem(QUIZ_MODE_STORAGE_KEY, mode);
    storage.setItem(QUIZ_MODE_CHOSEN_ON_STORAGE_KEY, quizModeDayKey(now));
  } catch {
    // 容量超過やプライベートモード。記憶できないだけで、クイズは続けられる。
  }
}
