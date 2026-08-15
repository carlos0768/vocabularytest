import { BATTLE_CHOICE_COUNT } from '@/lib/battle/config';
import type { BattleGeneratedQuestion, BattleSourceWord } from '@/lib/battle/types';

/**
 * Fallback meanings used only when a word has no distractors of its own and the
 * host's wordbook is too small to supply real ones.
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
 * Picks the words to ask, in order. Unusable rows are skipped and a headword is
 * only ever asked once, so a short wordbook shortens the battle rather than
 * repeating itself.
 */
export function selectBattleWords(
  words: readonly BattleSourceWord[],
  limit: number,
): BattleSourceWord[] {
  const selected: BattleSourceWord[] = [];
  const seenEnglish = new Set<string>();

  for (const word of words) {
    if (selected.length >= limit) break;
    if (!isUsable(word)) continue;
    const key = normalize(word.english);
    if (seenEnglish.has(key)) continue;
    seenEnglish.add(key);
    selected.push(word);
  }

  return selected;
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
 * Builds the shared question set from the host's (出題者) wordbook only.
 * The guest answers the host's words, and both players see exactly the same
 * questions in the same order.
 */
export function buildBattleQuestions(
  hostWords: readonly BattleSourceWord[],
  questionCount: number,
  shuffle: ShuffleFn = defaultShuffle,
): BattleGeneratedQuestion[] {
  const pool = shuffle(hostWords.filter(isUsable));
  const selected = selectBattleWords(pool, questionCount);

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
