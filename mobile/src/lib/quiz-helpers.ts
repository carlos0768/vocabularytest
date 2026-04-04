import type { QuizQuestion, Word } from '../types';
import { shuffleArray } from './utils';

export const MINIMUM_QUIZ_WORDS = 4;

const FALLBACK_DISTRACTORS = [
  '別の意味',
  '反対の意味',
  '関連する意味',
  '近い意味',
  '異なる表現',
  '別の使い方',
];

export function buildDistractors(
  words: Word[],
  correctJapanese: string,
  excludedWordId?: string
): string[] {
  const candidates = shuffleArray(
    Array.from(
      new Set(
        words
          .filter((word) => word.id !== excludedWordId)
          .map((word) => word.japanese.trim())
          .filter((label) => label.length > 0 && label !== correctJapanese)
      )
    )
  );

  const distractors = candidates.slice(0, 3);

  for (const fallback of FALLBACK_DISTRACTORS) {
    if (distractors.length >= 3) break;
    if (fallback === correctJapanese || distractors.includes(fallback)) continue;
    distractors.push(fallback);
  }

  while (distractors.length < 3) {
    distractors.push(`別の意味 ${distractors.length + 1}`);
  }

  return distractors;
}

export function buildQuizQuestion(words: Word[], word: Word): QuizQuestion {
  const options = shuffleArray([
    word.japanese,
    ...buildDistractors(words, word.japanese, word.id),
  ]);

  return {
    word,
    options,
    correctIndex: options.indexOf(word.japanese),
  };
}

export function buildQuizQuestions(words: Word[], count: number): QuizQuestion[] {
  const prioritized = [
    ...words.filter((word) => word.status !== 'mastered'),
    ...words.filter((word) => word.status === 'mastered'),
  ];

  return shuffleArray(prioritized)
    .slice(0, count)
    .map((word) => buildQuizQuestion(words, word));
}
