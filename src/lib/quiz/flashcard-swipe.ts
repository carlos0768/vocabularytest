/**
 * フラッシュカードの「スワイプ仕分け」。
 *
 * Quizlet / Tinder と同じで、右に飛ばしたら「覚えてる」、左に飛ばしたら
 * 「覚えてない」。1枚ごとに山札から抜けていき、最後に習得済み／未習得の
 * 2つの山として結果が出る。
 *
 * ここは判定と集計だけを持つ純粋関数の層。DOM もタイマーも通信も触らないので、
 * 「どのくらい引っ張ったら確定か」「覚えてる判定で単語がどう更新されるか」を
 * 画面を動かさずにテストできる。SM-2 の更新自体は既存の
 * `calculateNextReview` / `getStatusAfterAnswer` にそのまま乗せる ——
 * クイズで正解したときと同じ重みで扱いたいため。
 */

import { calculateNextReview, getStatusAfterAnswer } from '@/lib/spaced-repetition';
import type { Word, WordStatus } from '@/types';

/** 右＝覚えてる、左＝覚えてない。 */
export type SwipeVerdict = 'known' | 'unknown';

/** ここまで引っ張ったら仕分け確定（px）。 */
export const SWIPE_COMMIT_PX = 96;

/** カードを画面外へ飛ばす演出の長さ（ms）。 */
export const SWIPE_FLY_MS = 200;

export const SWIPE_VERDICT_LABELS: Record<SwipeVerdict, string> = {
  known: '覚えてる',
  unknown: '覚えてない',
};

/**
 * 指を離した時点の横移動から仕分けを決める。
 * しきい値に届かなければ null ＝ カードは元の位置に戻るだけ。
 */
export function getSwipeVerdict(deltaX: number, threshold: number = SWIPE_COMMIT_PX): SwipeVerdict | null {
  if (deltaX >= threshold) return 'known';
  if (deltaX <= -threshold) return 'unknown';
  return null;
}

/**
 * ドラッグ中のスタンプ（覚えてる／覚えてない）の濃さ。0〜1。
 * 「あとどれだけ引けば確定するか」を指に返すための値なので、しきい値で 1 に飽和する。
 */
export function getSwipeIntensity(deltaX: number, threshold: number = SWIPE_COMMIT_PX): number {
  if (threshold <= 0) return deltaX === 0 ? 0 : 1;
  const ratio = Math.abs(deltaX) / threshold;
  return ratio >= 1 ? 1 : ratio;
}

/** ドラッグ中に出すスタンプ。しきい値未満でも向きが決まっていれば薄く出す。 */
export function getSwipePreview(
  deltaX: number,
  threshold: number = SWIPE_COMMIT_PX,
): { verdict: SwipeVerdict; intensity: number; committed: boolean } | null {
  if (deltaX === 0) return null;
  const verdict: SwipeVerdict = deltaX > 0 ? 'known' : 'unknown';
  return {
    verdict,
    intensity: getSwipeIntensity(deltaX, threshold),
    committed: getSwipeVerdict(deltaX, threshold) !== null,
  };
}

/**
 * 仕分け結果を単語の更新内容に落とす。
 *
 * 覚えてる＝クイズの正解、覚えてない＝不正解と同じ扱い。学習状態を
 * フラッシュカード専用に持つと、クイズ側の習得度と食い違ってしまう。
 */
export function buildSwipeWordUpdate(
  word: Word,
  verdict: SwipeVerdict,
): { status: WordStatus } & ReturnType<typeof calculateNextReview> {
  const isCorrect = verdict === 'known';
  return {
    status: getStatusAfterAnswer(word.status, isCorrect),
    ...calculateNextReview(isCorrect, word),
  };
}

/** 1セッション分の仕分け記録。単語IDの順番＝仕分けた順。 */
export interface SwipeSession {
  readonly known: readonly string[];
  readonly unknown: readonly string[];
}

export const EMPTY_SWIPE_SESSION: SwipeSession = { known: [], unknown: [] };

/**
 * 仕分けを記録する。同じ単語を2度仕分けたら後の判定で上書きする
 * （やり直しで山札に戻した単語が両方の山に入らないように）。
 */
export function recordSwipe(session: SwipeSession, wordId: string, verdict: SwipeVerdict): SwipeSession {
  const known = session.known.filter((id) => id !== wordId);
  const unknown = session.unknown.filter((id) => id !== wordId);
  if (verdict === 'known') known.push(wordId);
  else unknown.push(wordId);
  return { known, unknown };
}

/** 直前の仕分けを取り消す（やり直しボタン）。 */
export function forgetSwipe(session: SwipeSession, wordId: string): SwipeSession {
  return {
    known: session.known.filter((id) => id !== wordId),
    unknown: session.unknown.filter((id) => id !== wordId),
  };
}

export function getSwipeVerdictFor(session: SwipeSession, wordId: string): SwipeVerdict | null {
  if (session.known.includes(wordId)) return 'known';
  if (session.unknown.includes(wordId)) return 'unknown';
  return null;
}

export function countSwipes(session: SwipeSession): { known: number; unknown: number; total: number } {
  return {
    known: session.known.length,
    unknown: session.unknown.length,
    total: session.known.length + session.unknown.length,
  };
}

/**
 * 「未習得だけもう一周」用の山札。仕分けた順を保つので、
 * 直前のセッションで詰まった順にそのまま出てくる。
 */
export function collectSwipedWords(
  words: readonly Word[],
  session: SwipeSession,
  verdict: SwipeVerdict,
): Word[] {
  const ids = verdict === 'known' ? session.known : session.unknown;
  const byId = new Map(words.map((word) => [word.id, word]));
  return ids.map((id) => byId.get(id)).filter((word): word is Word => Boolean(word));
}
