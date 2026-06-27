import type { QuizQuestion, Word } from '@/types';
import { shuffleArray } from '@/lib/utils';
import { sortWordsByPriority } from '@/lib/spaced-repetition';
import {
  buildWordOrderQuestion,
  isWordOrderEligible,
} from '@/lib/quiz/word-order';
import { isActiveQuizWord } from '@/lib/quiz/active-answer';
import {
  getWordMemoryBaseKey,
  isSameWordMeaning,
  selectPrimaryMeaningWords,
} from '@/lib/words/memory';
import {
  expandWordsForQuizTargets,
  getQuizTargetKey,
  isTranslationQuizTarget,
} from '@/lib/quiz/translation-targets';

export type QuizDirection = 'en-to-ja' | 'ja-to-en';

export const QUIZ_STATE_TTL_MS = 30 * 60 * 1000;

export const GENERIC_JA_DISTRACTOR_POOL = [
  '確認する', '提供する', '参加する', '検討する', '対応する', '説明する', '準備する', '記録する',
] as const;

export const GENERIC_EN_DISTRACTOR_POOL = [
  'consider', 'provide', 'develop', 'maintain', 'achieve', 'support', 'prepare', 'review',
] as const;

function normalizeDistractorText(value: string): string {
  return value.trim().toLowerCase();
}

function getSameWordJapaneseDistractors(sourceWords: readonly Word[], quizWords: readonly Word[], word: Word): Set<string> {
  const baseKey = getWordMemoryBaseKey(word);
  const correctJa = normalizeDistractorText(word.japanese);
  const distractors = new Set<string>();

  const addCandidate = (candidate: string | undefined) => {
    const normalized = normalizeDistractorText(candidate ?? '');
    if (normalized && normalized !== correctJa) {
      distractors.add(normalized);
    }
  };

  for (const item of [...sourceWords, ...quizWords]) {
    if (getWordMemoryBaseKey(item) !== baseKey) continue;
    addCandidate(item.japanese);
    for (const translation of item.translations ?? []) {
      addCandidate(translation.translationJa);
      addCandidate(translation.normalizedTranslationJa);
    }
  }

  return distractors;
}

export function getQuizStorageKey(projectId: string, reviewMode: boolean, learnMode = false): string {
  return `quiz_state_${reviewMode ? 'review' : learnMode ? 'learn' : projectId}`;
}

export function getFavoritesQuizStorageKey(projectId: string): string {
  return `quiz_state_${projectId}_favorites`;
}

export function isQuizStateExpired(timestamp: number, now: number = Date.now()): boolean {
  return now - timestamp > QUIZ_STATE_TTL_MS;
}

export function generateQuizQuestions(
  words: Word[],
  count: number,
  direction: QuizDirection = 'en-to-ja',
  shuffle: <T>(items: T[]) => T[] = shuffleArray,
  settings: { allowPendingWordOrderFallback?: boolean; preserveOrder?: boolean; primaryOnly?: boolean } = {},
): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const sourceWords = settings.primaryOnly ? selectPrimaryMeaningWords(words) : words;
  const quizWords = expandWordsForQuizTargets(sourceWords, { primaryOnly: settings.primaryOnly });

  for (const word of settings.preserveOrder ? quizWords : sortWordsByPriority(quizWords)) {
    if (questions.length >= count) break;

    if (!isTranslationQuizTarget(word) && !isActiveQuizWord(word) && isWordOrderEligible(word)) {
      const wordOrderQuestion = buildWordOrderQuestion(word, shuffle);
      if (wordOrderQuestion) {
        questions.push(wordOrderQuestion);
      }
      if (wordOrderQuestion || !settings.allowPendingWordOrderFallback) {
        continue;
      }
    }

    if (direction === 'ja-to-en') {
      const correctEn = word.english.trim().toLowerCase();
      const wordTargetKey = getQuizTargetKey(word);
      const wordBaseKey = getWordMemoryBaseKey(word);
      const otherWords = quizWords.filter((item) => getQuizTargetKey(item) !== wordTargetKey && getWordMemoryBaseKey(item) !== wordBaseKey);
      let englishDistractors = shuffle(otherWords)
        .map((item) => item.english)
        .filter((english) => english.trim().toLowerCase() !== correctEn);

      englishDistractors = [...new Set(englishDistractors.map((english) => english.trim()))].slice(0, 3);

      let genericIndex = 0;
      while (
        englishDistractors.length < 3 &&
        genericIndex < GENERIC_EN_DISTRACTOR_POOL.length
      ) {
        const generic = GENERIC_EN_DISTRACTOR_POOL[genericIndex++];
        if (generic.toLowerCase() !== correctEn && !englishDistractors.includes(generic)) {
          englishDistractors.push(generic);
        }
      }

      while (englishDistractors.length < 3) {
        englishDistractors.push(`option${englishDistractors.length + 1}`);
      }

      englishDistractors = englishDistractors.slice(0, 3);
      const options = shuffle([word.english, ...englishDistractors]);

      questions.push({
        word,
        options,
        correctIndex: options.indexOf(word.english),
      });
      continue;
    }

    const correctJa = word.japanese.trim().toLowerCase();
    const wordTargetKey = getQuizTargetKey(word);
    const wordBaseKey = getWordMemoryBaseKey(word);
    const sameWordJapaneseDistractors = getSameWordJapaneseDistractors(sourceWords, quizWords, word);
    const sameMeaningTranslations = new Set(
      quizWords
        .filter((item) => getQuizTargetKey(item) !== wordTargetKey && isSameWordMeaning(item, word))
        .map((item) => item.japanese.trim().toLowerCase())
        .filter(Boolean),
    );
    let distractors: string[] = [...(word.distractors || [])];

    if (distractors.length === 0 || (distractors.length === 3 && distractors[0] === '選択肢1')) {
      const otherWords = quizWords.filter((item) => getQuizTargetKey(item) !== wordTargetKey && getWordMemoryBaseKey(item) !== wordBaseKey);
      distractors = shuffle(otherWords)
        .map((item) => item.japanese)
        .filter((japanese) => japanese.trim().toLowerCase() !== correctJa);
    }

    distractors = [...new Set(distractors.map((distractor) => distractor.trim()))].filter(
      (distractor) => {
        const normalized = distractor.toLowerCase();
        return distractor.length > 0
          && normalized !== correctJa
          && !sameMeaningTranslations.has(normalized)
          && !sameWordJapaneseDistractors.has(normalized);
      },
    );

    let genericIndex = 0;
    while (distractors.length < 3 && genericIndex < GENERIC_JA_DISTRACTOR_POOL.length) {
      const generic = GENERIC_JA_DISTRACTOR_POOL[genericIndex++];
      if (generic.toLowerCase() !== correctJa && !distractors.includes(generic)) {
        distractors.push(generic);
      }
    }

    while (distractors.length < 3) {
      distractors.push(`選択肢${distractors.length + 1}`);
    }

    distractors = distractors.slice(0, 3);
    const options = shuffle([word.japanese, ...distractors]);

    questions.push({
      word,
      options,
      correctIndex: options.indexOf(word.japanese),
    });
  }

  return questions;
}

export function applyWordOrderQuestionsToPendingQuiz(
  questions: QuizQuestion[],
  words: Word[],
  currentIndex: number,
  shuffle: <T>(items: T[]) => T[] = shuffleArray,
): QuizQuestion[] {
  const wordByTargetKey = new Map(
    expandWordsForQuizTargets(words).map((word) => [getQuizTargetKey(word), word]),
  );
  const wordOrderQuestionWordIds = new Set(
    questions
      .filter((question) => question.type === 'word-order')
      .map((question) => getQuizTargetKey(question.word)),
  );
  const insertAfterCurrent: QuizQuestion[] = [];
  let changed = false;

  const nextQuestions = questions.map((question, index) => {
    if (question.type === 'word-order') {
      return question;
    }

    if (isActiveQuizWord(question.word)) {
      return question;
    }

    if (isTranslationQuizTarget(question.word)) {
      return question;
    }

    const questionTargetKey = getQuizTargetKey(question.word);
    const updatedWord = wordByTargetKey.get(questionTargetKey);
    if (!updatedWord) {
      return question;
    }
    if (isActiveQuizWord(updatedWord)) {
      return question;
    }

    const wordOrderQuestion = buildWordOrderQuestion(updatedWord, shuffle);
    if (!wordOrderQuestion) {
      return question;
    }

    if (index <= currentIndex) {
      if (!wordOrderQuestionWordIds.has(questionTargetKey)) {
        insertAfterCurrent.push(wordOrderQuestion);
        wordOrderQuestionWordIds.add(questionTargetKey);
        changed = true;
      }
      return question;
    }

    changed = true;
    wordOrderQuestionWordIds.add(questionTargetKey);
    return wordOrderQuestion;
  });

  if (insertAfterCurrent.length === 0) {
    return changed ? nextQuestions : questions;
  }

  const insertAt = Math.min(Math.max(currentIndex + 1, 0), nextQuestions.length);
  return [
    ...nextQuestions.slice(0, insertAt),
    ...insertAfterCurrent,
    ...nextQuestions.slice(insertAt),
  ];
}
