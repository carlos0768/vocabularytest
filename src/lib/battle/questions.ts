import { BATTLE_CHOICE_COUNT } from '@/lib/battle/config';
import type { BattleGeneratedQuestion, BattleSourceWord } from '@/lib/battle/types';

/**
 * Fallback meanings used only when a word has no distractors of its own and the
 * merged pool is too small to supply real ones.
 */
export const BATTLE_GENERIC_DISTRACTORS = [
  '確認する', '提供する', '参加する', '検討する', '対応する', '説明する', '準備する', '記録する',
] as const;

export type ShuffleFn = <T>(items: readonly T[]) => T[];

const defaultShuffle: ShuffleFn = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isUsable(word: BattleSourceWord): boolean {
  return word.english.trim().length > 0 && word.japanese.trim().length > 0;
}

/**
 * Takes from both sides in turn so neither player's wordbook dominates the set.
 * When one side runs out the other fills the remainder.
 */
export function interleaveSources(
  hostWords: readonly BattleSourceWord[],
  guestWords: readonly BattleSourceWord[],
  limit: number,
): BattleSourceWord[] {
  const merged: BattleSourceWord[] = [];
  const seenEnglish = new Set<string>();
  let hostIndex = 0;
  let guestIndex = 0;
  let takeHost = true;

  const push = (word: BattleSourceWord | undefined): boolean => {
    if (!word || !isUsable(word)) return false;
    const key = normalize(word.english);
    if (seenEnglish.has(key)) return false;
    seenEnglish.add(key);
    merged.push(word);
    return true;
  };

  while (merged.length < limit && (hostIndex < hostWords.length || guestIndex < guestWords.length)) {
    const hostExhausted = hostIndex >= hostWords.length;
    const guestExhausted = guestIndex >= guestWords.length;
    const useHost = hostExhausted ? false : guestExhausted ? true : takeHost;

    if (useHost) {
      push(hostWords[hostIndex]);
      hostIndex += 1;
    } else {
      push(guestWords[guestIndex]);
      guestIndex += 1;
    }

    // Only alternate when both sides still have words left to offer.
    if (!hostExhausted && !guestExhausted) {
      takeHost = !takeHost;
    }
  }

  return merged;
}

function buildChoices(
  word: BattleSourceWord,
  pool: readonly BattleSourceWord[],
  shuffle: ShuffleFn,
): { choices: string[]; correctIndex: number } {
  const answer = word.japanese.trim();
  const answerKey = normalize(answer);
  const seen = new Set<string>([answerKey]);
  const distractors: string[] = [];

  const add = (candidate: string | undefined) => {
    if (distractors.length >= BATTLE_CHOICE_COUNT - 1) return;
    const trimmed = (candidate ?? '').trim();
    if (!trimmed) return;
    const key = normalize(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    distractors.push(trimmed);
  };

  for (const candidate of word.distractors) add(candidate);

  if (distractors.length < BATTLE_CHOICE_COUNT - 1) {
    for (const other of shuffle(pool)) {
      if (other.id === word.id) continue;
      add(other.japanese);
      if (distractors.length >= BATTLE_CHOICE_COUNT - 1) break;
    }
  }

  for (const generic of BATTLE_GENERIC_DISTRACTORS) add(generic);

  const choices = shuffle([answer, ...distractors]);
  return { choices, correctIndex: choices.indexOf(answer) };
}

/**
 * Builds the shared question set for a battle by merging both participants'
 * wordbooks. Both players see exactly the same questions in the same order.
 */
export function buildBattleQuestions(
  hostWords: readonly BattleSourceWord[],
  guestWords: readonly BattleSourceWord[],
  questionCount: number,
  shuffle: ShuffleFn = defaultShuffle,
): BattleGeneratedQuestion[] {
  const usableHost = shuffle(hostWords.filter(isUsable));
  const usableGuest = shuffle(guestWords.filter(isUsable));
  const selected = interleaveSources(usableHost, usableGuest, questionCount);
  const pool = [...usableHost, ...usableGuest];

  return selected.map((word, roundIndex) => {
    const { choices, correctIndex } = buildChoices(word, pool, shuffle);
    return {
      roundIndex,
      prompt: word.english.trim(),
      choices,
      correctIndex,
      answer: word.japanese.trim(),
      sourceUserId: word.ownerId,
    };
  });
}
