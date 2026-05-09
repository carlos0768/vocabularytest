import type { QuizQuestion, Word } from '@/types';
import { shuffleArray } from '@/lib/utils';
import { sortWordsByPriority } from '@/lib/spaced-repetition';
import {
  buildWordOrderQuestion,
  isWordOrderEligible,
} from '@/lib/quiz/word-order';

export type QuizDirection = 'en-to-ja' | 'ja-to-en';

export const QUIZ_STATE_TTL_MS = 30 * 60 * 1000;

export const GENERIC_JA_DISTRACTOR_POOL = [
  '確認する', '提供する', '参加する', '検討する', '対応する', '説明する', '準備する', '記録する',
] as const;

export const GENERIC_EN_DISTRACTOR_POOL = [
  'consider', 'provide', 'develop', 'maintain', 'achieve', 'support', 'prepare', 'review',
] as const;

export function getQuizStorageKey(projectId: string, reviewMode: boolean, learnMode = false): string {
  return `quiz_state_${reviewMode ? 'review' : learnMode ? 'learn' : projectId}`;
}

export function isQuizStateExpired(timestamp: number, now: number = Date.now()): boolean {
  return now - timestamp > QUIZ_STATE_TTL_MS;
}

export function generateQuizQuestions(
  words: Word[],
  count: number,
  direction: QuizDirection = 'en-to-ja',
  shuffle: <T>(items: T[]) => T[] = shuffleArray,
  settings: { allowPendingWordOrderFallback?: boolean } = {},
): QuizQuestion[] {
  const questions: QuizQuestion[] = [];

  for (const word of sortWordsByPriority(words)) {
    if (questions.length >= count) break;

    if (isWordOrderEligible(word)) {
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
      const otherWords = words.filter((item) => item.id !== word.id);
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
    let distractors: string[] = [...(word.distractors || [])];

    if (distractors.length === 0 || (distractors.length === 3 && distractors[0] === '選択肢1')) {
      const otherWords = words.filter((item) => item.id !== word.id);
      distractors = shuffle(otherWords)
        .map((item) => item.japanese)
        .filter((japanese) => japanese.trim().toLowerCase() !== correctJa);
    }

    distractors = [...new Set(distractors.map((distractor) => distractor.trim()))].filter(
      (distractor) => distractor.length > 0 && distractor.toLowerCase() !== correctJa,
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
  const wordById = new Map(words.map((word) => [word.id, word]));
  const wordOrderQuestionWordIds = new Set(
    questions
      .filter((question) => question.type === 'word-order')
      .map((question) => question.word.id),
  );
  const insertAfterCurrent: QuizQuestion[] = [];
  let changed = false;

  const nextQuestions = questions.map((question, index) => {
    if (question.type === 'word-order') {
      return question;
    }

    const updatedWord = wordById.get(question.word.id);
    if (!updatedWord) {
      return question;
    }

    const wordOrderQuestion = buildWordOrderQuestion(updatedWord, shuffle);
    if (!wordOrderQuestion) {
      return question;
    }

    if (index <= currentIndex) {
      if (!wordOrderQuestionWordIds.has(question.word.id)) {
        insertAfterCurrent.push(wordOrderQuestion);
        wordOrderQuestionWordIds.add(question.word.id);
        changed = true;
      }
      return question;
    }

    changed = true;
    wordOrderQuestionWordIds.add(question.word.id);
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
