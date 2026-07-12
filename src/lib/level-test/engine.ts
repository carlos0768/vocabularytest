import { EIKEN_LEVEL_ORDER } from '@/lib/ai/prompts/eiken';
import { shuffleArray } from '@/lib/utils';
import type { BankWord, LevelTestBank } from './bank';

// 語彙レベル診断の適応アルゴリズム(純粋ロジック)。
//
// - 全20問。同一レベルで2問連続正解するとレベルアップ。
// - レベルアップ直後の1問目を誤答すると1レベル降格(連鎖降格はしない)。
// - それ以外の誤答はレベル維持でstreakリセットのみ。
// - 20問終了時点のレベルが測定結果。

export const LEVEL_TEST_QUESTION_COUNT = 20;
export const MIN_LEVEL_INDEX = 0;
export const MAX_LEVEL_INDEX = EIKEN_LEVEL_ORDER.length - 1; // 6
// 4級スタート: 初手を誤答すると5級へ降格するので初心者も適正判定でき、
// 上級者が易しすぎる問題に費やす問数も最小限になる。
export const LEVEL_TEST_START_LEVEL = 1;
const STREAK_TO_LEVEL_UP = 2;

// index 0..6 = 英検5級..1級(EIKEN_LEVEL_ORDER と同順)
export const EIKEN_LEVEL_LABELS = [
  '英検5級',
  '英検4級',
  '英検3級',
  '英検準2級',
  '英検2級',
  '英検準1級',
  '英検1級',
] as const;

// 各級合格の目安としてよく引用される推定語彙数。定数1箇所で調整できるようにする。
export const VOCAB_SIZE_BY_LEVEL = [600, 1300, 2100, 3600, 5100, 7500, 12000] as const;

export type LevelTestState = {
  levelIndex: number;
  answeredCount: number;
  // 現在のレベルでの連続正解数
  streak: number;
  // 次の回答が「レベルアップ(または開始)直後の1問目」かどうか
  firstAtLevel: boolean;
  maxLevelIndex: number;
  clearedMax: boolean;
  askedByLevel: number[];
  correctByLevel: number[];
};

export type LevelTestEvent = 'correct' | 'wrong' | 'level-up' | 'level-down' | 'max-cleared';

export type LevelTestResult = {
  finalLevel: number;
  maxLevel: number;
  clearedMax: boolean;
  correctTotal: number;
  askedByLevel: number[];
  correctByLevel: number[];
};

export function createInitialState(startLevel: number = LEVEL_TEST_START_LEVEL): LevelTestState {
  const levelIndex = Math.min(MAX_LEVEL_INDEX, Math.max(MIN_LEVEL_INDEX, startLevel));
  return {
    levelIndex,
    answeredCount: 0,
    streak: 0,
    firstAtLevel: true,
    maxLevelIndex: levelIndex,
    clearedMax: false,
    askedByLevel: EIKEN_LEVEL_ORDER.map(() => 0),
    correctByLevel: EIKEN_LEVEL_ORDER.map(() => 0),
  };
}

export function isFinished(state: LevelTestState): boolean {
  return state.answeredCount >= LEVEL_TEST_QUESTION_COUNT;
}

export function answerQuestion(
  state: LevelTestState,
  correct: boolean,
): { state: LevelTestState; events: LevelTestEvent[] } {
  const next: LevelTestState = {
    ...state,
    askedByLevel: [...state.askedByLevel],
    correctByLevel: [...state.correctByLevel],
  };
  const events: LevelTestEvent[] = [correct ? 'correct' : 'wrong'];

  next.askedByLevel[next.levelIndex] += 1;
  next.answeredCount += 1;

  if (correct) {
    next.correctByLevel[next.levelIndex] += 1;
    next.streak += 1;
    next.firstAtLevel = false;

    if (next.streak >= STREAK_TO_LEVEL_UP) {
      if (next.levelIndex < MAX_LEVEL_INDEX) {
        next.levelIndex += 1;
        next.streak = 0;
        next.firstAtLevel = true;
        next.maxLevelIndex = Math.max(next.maxLevelIndex, next.levelIndex);
        events.push('level-up');
      } else {
        next.streak = 0;
        if (!next.clearedMax) {
          next.clearedMax = true;
          events.push('max-cleared');
        }
      }
    }
    return { state: next, events };
  }

  const droppedFromFirst = next.firstAtLevel && next.levelIndex > MIN_LEVEL_INDEX;
  next.streak = 0;
  next.firstAtLevel = false;
  if (droppedFromFirst) {
    next.levelIndex -= 1;
    events.push('level-down');
  }
  return { state: next, events };
}

export function buildResult(state: LevelTestState): LevelTestResult {
  return {
    finalLevel: state.levelIndex,
    maxLevel: state.maxLevelIndex,
    clearedMax: state.clearedMax,
    correctTotal: state.correctByLevel.reduce((sum, count) => sum + count, 0),
    askedByLevel: [...state.askedByLevel],
    correctByLevel: [...state.correctByLevel],
  };
}

// ---------------------------------------------------------------------------
// 出題サンプリング(同一セッション内で単語を繰り返さない)
// ---------------------------------------------------------------------------

export function usedKeyFor(levelIndex: number, wordIndex: number): string {
  return `${levelIndex}:${wordIndex}`;
}

// 現在レベルの未出題語からランダムに1語選ぶ。レベルが枯渇していた場合は
// 近いレベル(易しい側優先)へフォールバックする。250語/レベルに対して
// 20問なので実運用では枯渇しないが、防御的に実装しておく。
export function pickQuestionIndex(
  bank: LevelTestBank,
  levelIndex: number,
  usedKeys: ReadonlySet<string>,
  random: () => number = Math.random,
): { levelIndex: number; wordIndex: number } | null {
  const candidateLevels: number[] = [levelIndex];
  for (let distance = 1; distance <= MAX_LEVEL_INDEX; distance += 1) {
    if (levelIndex - distance >= MIN_LEVEL_INDEX) candidateLevels.push(levelIndex - distance);
    if (levelIndex + distance <= MAX_LEVEL_INDEX) candidateLevels.push(levelIndex + distance);
  }

  for (const candidateLevel of candidateLevels) {
    const words = bank.levels[candidateLevel] ?? [];
    const unusedIndexes: number[] = [];
    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      if (!usedKeys.has(usedKeyFor(candidateLevel, wordIndex))) {
        unusedIndexes.push(wordIndex);
      }
    }
    if (unusedIndexes.length > 0) {
      const picked = unusedIndexes[Math.floor(random() * unusedIndexes.length)];
      return { levelIndex: candidateLevel, wordIndex: picked };
    }
  }

  return null;
}

export type LevelTestQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
};

export function buildQuestion(
  word: BankWord,
  shuffle: <T>(items: T[]) => T[] = shuffleArray,
): LevelTestQuestion {
  const options = shuffle([word.japanese, ...word.distractors]);
  return {
    prompt: word.english,
    options,
    correctIndex: options.indexOf(word.japanese),
  };
}
