import type { Word } from '@/types';

const ACTIVE_QUIZ_SPACE_RE = /[\s\u3000]+/g;

export function isActiveQuizWord(word: Pick<Word, 'vocabularyType'>): boolean {
  return word.vocabularyType === 'active';
}

export function stripActiveQuizAnswerSpaces(value: string): string {
  return value.replace(ACTIVE_QUIZ_SPACE_RE, '');
}

export function normalizeActiveQuizAnswer(value: string): string {
  return stripActiveQuizAnswerSpaces(value).toLowerCase();
}
