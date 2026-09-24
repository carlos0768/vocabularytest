/**
 * フラッシュカードの「SM-2 4段階評価」。
 *
 * カードを裏返して意味を確かめたあと、思い出せた度合いを
 * もう一度 / 難しい / 普通 / 簡単 の4択で自己評価する (Anki と同じ流儀)。
 * 4つはそのまま SM-2 の quality (1 / 3 / 4 / 5) に対応させ、
 * 既存の `calculateNextReviewByQuality` / `getStatusAfterQuality` に乗せる ——
 * クイズや対戦と同じ習得度の物差しで扱いたいため。
 *
 * ここは判定と集計だけを持つ純粋関数の層。DOM もタイマーも通信も触らないので、
 * 「どの評価で単語がどう更新されるか」を画面を動かさずにテストできる。
 */

import {
  calculateNextReviewByQuality,
  getStatusAfterQuality,
  type ReviewQuality,
} from '@/lib/spaced-repetition';
import type { Word, WordStatus } from '@/types';

/** 自己評価の4段階。並び順＝ボタンの並び順 (左が弱い記憶、右が強い記憶)。 */
export type FlashcardGrade = 'again' | 'hard' | 'good' | 'easy';

export const FLASHCARD_GRADES: readonly FlashcardGrade[] = ['again', 'hard', 'good', 'easy'];

/**
 * 各評価を SM-2 の quality に落とす。
 * again=1 (思い出せない)、hard=3 (迷いながら正解)、good=4 (正解)、easy=5 (即答)。
 * 2 は使わない —— 「思い出せなかった」に濃淡を付けても学習者は区別できないため。
 */
export const FLASHCARD_GRADE_QUALITY: Record<FlashcardGrade, ReviewQuality> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export const FLASHCARD_GRADE_LABELS: Record<FlashcardGrade, string> = {
  again: 'もう一度',
  hard: '難しい',
  good: '普通',
  easy: '簡単',
};

/** ボタン下の一言。評価の基準を揃えるためのもので、装飾ではない。 */
export const FLASHCARD_GRADE_HINTS: Record<FlashcardGrade, string> = {
  again: '思い出せない',
  hard: '迷った',
  good: '思い出せた',
  easy: '即答できた',
};

/** キーボードの 1〜4 をボタンの並びと同じ順に対応させる。 */
export const FLASHCARD_GRADE_KEYS: Record<FlashcardGrade, string> = {
  again: '1',
  hard: '2',
  good: '3',
  easy: '4',
};

export function isFlashcardGrade(value: unknown): value is FlashcardGrade {
  return (FLASHCARD_GRADES as readonly unknown[]).includes(value);
}

/** 押されたキーに対応する評価。該当しなければ null。 */
export function gradeForKey(key: string): FlashcardGrade | null {
  const found = FLASHCARD_GRADES.find((grade) => FLASHCARD_GRADE_KEYS[grade] === key);
  return found ?? null;
}

/** 「覚えていた」側か。誤答記録 (間違えた単語の絞り込み) や正解数の集計に使う。 */
export function isPassingGrade(grade: FlashcardGrade): boolean {
  return FLASHCARD_GRADE_QUALITY[grade] >= 3;
}

/**
 * 評価を単語の更新内容に落とす。
 *
 * 学習状態をフラッシュカード専用に持つと、クイズ側の習得度と食い違ってしまうので、
 * SM-2 のフィールド (easeFactor / intervalDays / repetition / nextReviewAt) と
 * status の両方を、クイズと同じ関数で更新する。
 */
export function buildGradeWordUpdate(
  word: Word,
  grade: FlashcardGrade,
): { status: WordStatus } & ReturnType<typeof calculateNextReviewByQuality> {
  const quality = FLASHCARD_GRADE_QUALITY[grade];
  return {
    status: getStatusAfterQuality(word.status, quality),
    ...calculateNextReviewByQuality(quality, word),
  };
}

/** 1セッション分の評価記録。単語ID → 最後に付けた評価。 */
export type GradeSession = Readonly<Record<string, FlashcardGrade>>;

export const EMPTY_GRADE_SESSION: GradeSession = {};

/**
 * 評価を記録する。同じ単語を2度評価したら後の評価で上書きする
 * (「前へ」で戻ってやり直した単語が二重に数えられないように)。
 */
export function recordGrade(session: GradeSession, wordId: string, grade: FlashcardGrade): GradeSession {
  return { ...session, [wordId]: grade };
}

export function getGradeFor(session: GradeSession, wordId: string): FlashcardGrade | null {
  return session[wordId] ?? null;
}

export interface GradeTally extends Record<FlashcardGrade, number> {
  total: number;
}

export function countGrades(session: GradeSession): GradeTally {
  const tally: GradeTally = { again: 0, hard: 0, good: 0, easy: 0, total: 0 };
  for (const grade of Object.values(session)) {
    tally[grade] += 1;
    tally.total += 1;
  }
  return tally;
}

/**
 * 「もう一度」を付けた単語だけの山札。山札の並び順を保つので、
 * 元の優先度順のまま、詰まった単語だけがもう一周出てくる。
 */
export function collectGradedWords(
  words: readonly Word[],
  session: GradeSession,
  grade: FlashcardGrade,
): Word[] {
  return words.filter((word) => session[word.id] === grade);
}
