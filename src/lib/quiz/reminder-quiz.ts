import type { Word } from '@/types';
import { sortWordsByPriority } from '@/lib/spaced-repetition';

export const REMINDER_QUIZ_TOTAL_COUNT = 10;
export const REMINDER_QUIZ_PRIORITY_COUNT = 5;
export const REMINDER_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReminderWrongAnswerRef = {
  wordId: string;
  lastWrongAt: number;
};

export function parseReminderPriorityIds(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .slice(0, REMINDER_QUIZ_PRIORITY_COUNT);
}

/**
 * Build the ordered word list for a reminder quiz.
 *
 * The first `priorityCount` slots go to (in order): the word ids embedded in
 * the reminder notification, then words due for review within 24h (soonest
 * first), then recently mistaken words. The rest of the pool follows in
 * normal study-priority order, capped at `totalCount` words.
 */
export function selectReminderQuizWords(params: {
  words: Word[];
  priorityIds?: string[];
  wrongAnswers?: ReminderWrongAnswerRef[];
  now?: Date;
  totalCount?: number;
  priorityCount?: number;
}): Word[] {
  const now = params.now ?? new Date();
  const totalCount = params.totalCount ?? REMINDER_QUIZ_TOTAL_COUNT;
  const priorityCount = params.priorityCount ?? REMINDER_QUIZ_PRIORITY_COUNT;
  const wordById = new Map(params.words.map((word) => [word.id, word]));

  const priorityWords: Word[] = [];
  const usedIds = new Set<string>();
  const addPriorityWord = (word: Word | undefined) => {
    if (!word || usedIds.has(word.id) || priorityWords.length >= priorityCount) return;
    usedIds.add(word.id);
    priorityWords.push(word);
  };

  for (const id of params.priorityIds ?? []) {
    addPriorityWord(wordById.get(id));
  }

  if (priorityWords.length < priorityCount) {
    const windowEndMs = now.getTime() + REMINDER_REVIEW_WINDOW_MS;
    const upcomingReviews = params.words
      .filter((word) => {
        if (!word.nextReviewAt) return false;
        const nextMs = Date.parse(word.nextReviewAt);
        return !Number.isNaN(nextMs) && nextMs <= windowEndMs;
      })
      .sort((a, b) => Date.parse(a.nextReviewAt ?? '') - Date.parse(b.nextReviewAt ?? ''));
    for (const word of upcomingReviews) {
      addPriorityWord(word);
    }
  }

  if (priorityWords.length < priorityCount) {
    const recentWrongs = [...(params.wrongAnswers ?? [])]
      .sort((a, b) => b.lastWrongAt - a.lastWrongAt);
    for (const wrong of recentWrongs) {
      addPriorityWord(wordById.get(wrong.wordId));
    }
  }

  const rest = sortWordsByPriority(
    params.words.filter((word) => !usedIds.has(word.id)),
    now,
  );

  return [...priorityWords, ...rest].slice(0, totalCount);
}
