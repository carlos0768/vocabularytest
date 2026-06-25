import type { Word, WordStatus, WordTranslation } from '@/types';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';

type QuizTargetOptions = {
  primaryOnly?: boolean;
};

const DEFAULT_SR = getDefaultSpacedRepetitionFields();

function normalizeKeyPart(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getTranslationStatus(translation: WordTranslation): WordStatus {
  return translation.status ?? 'new';
}

function getTranslationTargetKey(word: Word, translation: WordTranslation): string {
  if (translation.id) return `translation:${translation.id}`;
  if (translation.lexiconSenseId) return `sense:${translation.lexiconSenseId}`;
  if (translation.distinctKey) return `distinct:${normalizeKeyPart(translation.distinctKey)}`;
  return `translation-text:${word.id}:${normalizeKeyPart(translation.normalizedTranslationJa || translation.translationJa)}`;
}

export function getQuizTargetKey(word: Word): string {
  return word.quizTarget?.key ?? `word:${word.id}`;
}

export function isTranslationQuizTarget(word: Pick<Word, 'quizTarget'>): boolean {
  return word.quizTarget?.kind === 'translation';
}

export function isDistinctQuizTranslation(translation: WordTranslation): boolean {
  return Boolean(normalizeKeyPart(translation.distinctKey)) && !translation.isPrimary;
}

function buildTranslationQuizWord(word: Word, translation: WordTranslation): Word {
  const key = getTranslationTargetKey(word, translation);
  return {
    ...word,
    japanese: translation.translationJa,
    lexiconSenseId: translation.lexiconSenseId ?? word.lexiconSenseId,
    lexiconDistinctKey: translation.distinctKey,
    lexiconSenseIsPrimary: translation.lexiconSenseIsPrimary ?? false,
    status: getTranslationStatus(translation),
    lastReviewedAt: translation.lastReviewedAt,
    nextReviewAt: translation.nextReviewAt,
    easeFactor: translation.easeFactor ?? DEFAULT_SR.easeFactor,
    intervalDays: translation.intervalDays ?? DEFAULT_SR.intervalDays,
    repetition: translation.repetition ?? DEFAULT_SR.repetition,
    wordOrderQuiz: undefined,
    translations: [{
      ...translation,
      isPrimary: true,
      meaningRank: 1,
      position: 0,
    }],
    quizTarget: {
      kind: 'translation',
      key,
      wordId: word.id,
      translationId: translation.id,
      lexiconSenseId: translation.lexiconSenseId,
      distinctKey: translation.distinctKey,
    },
  };
}

export function expandWordForQuizTargets(
  word: Word,
  options: QuizTargetOptions = {},
): Word[] {
  const primaryWord: Word = {
    ...word,
    quizTarget: {
      kind: 'word',
      key: `word:${word.id}`,
      wordId: word.id,
      lexiconSenseId: word.lexiconSenseId,
      distinctKey: word.lexiconDistinctKey,
    },
  };

  if (options.primaryOnly) {
    return [primaryWord];
  }

  const targets: Word[] = [primaryWord];
  const seen = new Set<string>([getQuizTargetKey(primaryWord)]);

  for (const translation of word.translations ?? []) {
    if (!isDistinctQuizTranslation(translation)) continue;
    const target = buildTranslationQuizWord(word, translation);
    const targetKey = getQuizTargetKey(target);
    if (seen.has(targetKey)) continue;
    seen.add(targetKey);
    targets.push(target);
  }

  return targets;
}

export function expandWordsForQuizTargets(
  words: readonly Word[],
  options: QuizTargetOptions = {},
): Word[] {
  return words.flatMap((word) => expandWordForQuizTargets(word, options));
}

export function getQuizTargetCount(
  words: readonly Word[],
  options: QuizTargetOptions = {},
): number {
  return expandWordsForQuizTargets(words, options).length;
}

export function hasUnmasteredQuizTarget(
  word: Word,
  options: QuizTargetOptions = {},
): boolean {
  return expandWordForQuizTargets(word, options).some((target) => target.status !== 'mastered');
}

export function isQuizTargetDueForReview(word: Word, now: Date = new Date()): boolean {
  if (!word.nextReviewAt) {
    return Boolean(word.lastReviewedAt) || word.status !== 'new';
  }

  const nextReview = new Date(word.nextReviewAt);
  return nextReview <= now;
}

export function hasDueQuizTarget(
  word: Word,
  options: QuizTargetOptions = {},
  now: Date = new Date(),
): boolean {
  return expandWordForQuizTargets(word, options).some((target) => isQuizTargetDueForReview(target, now));
}

export function mergeTranslationProgress(
  word: Word,
  target: NonNullable<Word['quizTarget']>,
  updates: {
    status: WordStatus;
    lastReviewedAt?: string;
    nextReviewAt?: string;
    easeFactor?: number;
    intervalDays?: number;
    repetition?: number;
  },
): Word {
  if (target.kind !== 'translation') return word;

  const translations = (word.translations ?? []).map((translation) => {
    const matches = target.translationId
      ? translation.id === target.translationId
      : target.lexiconSenseId
        ? translation.lexiconSenseId === target.lexiconSenseId
        : normalizeKeyPart(translation.distinctKey) === normalizeKeyPart(target.distinctKey);
    return matches ? { ...translation, ...updates } : translation;
  });

  return { ...word, translations };
}
