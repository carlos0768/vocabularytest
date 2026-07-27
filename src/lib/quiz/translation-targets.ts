import type { Word, WordStatus, WordTranslation } from '@/types';
import { getDefaultSpacedRepetitionFields } from '@/lib/spaced-repetition';
import { filterSensesByEikenLevel } from '@/lib/quiz/sense-eiken-level';

type QuizTargetOptions = {
  primaryOnly?: boolean;
  /**
   * 学習者の英検級（'5'〜'1'）。指定すると、その級から見て易しすぎる語義を
   * 出題対象から外す（準1級に "right = 右" を出さない）。
   */
  eikenLevel?: string | null;
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

/**
 * 出題対象の「その語義自体」のCEFRレベル。
 *
 * 語義単位の出題（多義語の非主要語義）では、見出し語のCEFR（word.cefrLevel）へ
 * フォールバックしてはいけない。見出し語レベルは主要語義の難易度なので、
 * 例えば right（A1）の「権利」を A1 とみなして落としてしまう。
 * 主要語義の出題では見出し語レベルを難易度の代用として使える。
 */
export function getQuizTargetSenseCefrLevel(word: Word): string | undefined {
  if (isTranslationQuizTarget(word)) return word.lexiconSenseCefrLevel;
  return word.lexiconSenseCefrLevel ?? word.cefrLevel;
}

function buildTranslationQuizWord(word: Word, translation: WordTranslation): Word {
  const key = getTranslationTargetKey(word, translation);
  return {
    ...word,
    japanese: translation.translationJa,
    // 誤答選択肢・例文は正解訳に紐づくので、語義固有の値があればそれを使う。
    // 単語行の値は主要語義向けに生成されているため流用しない。
    distractors: translation.distractors ?? [],
    exampleSentence: undefined,
    exampleSentenceJa: undefined,
    lexiconSenseId: translation.lexiconSenseId ?? word.lexiconSenseId,
    lexiconDistinctKey: translation.distinctKey,
    lexiconSenseCefrLevel: translation.cefrLevel,
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

  if (targets.length === 1 || !options.eikenLevel) {
    return targets;
  }

  // 学習者の英検級から見て易しすぎる語義を落とす。全語義が落ちる場合は
  // フィルタ側が最も難しい語義を1つ残すので、出題が消えることはない。
  return filterSensesByEikenLevel(
    targets.map((target) => ({
      target,
      cefrLevel: getQuizTargetSenseCefrLevel(target),
      isPrimary: !isTranslationQuizTarget(target),
    })),
    options.eikenLevel,
  ).map((candidate) => candidate.target);
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
