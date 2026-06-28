import { calculateNextReview, getStatusAfterAnswer } from '@/lib/spaced-repetition';
import type { QuizDirection } from '@/lib/quiz/quiz-state';
import type { Word } from '@/types';

export interface QuizAnswerOutcomePlan {
  wordUpdates: ReturnType<typeof calculateNextReview> & {
    status: Word['status'];
  };
  wrongAnswer?: {
    wordId: string;
    english: string;
    japanese: string;
    projectId: string;
    distractors?: string[];
  };
}

export function getTypeInCorrectAnswer(params: {
  word: Pick<Word, 'english' | 'japanese'>;
  isActiveVocabulary: boolean;
  quizDirection: QuizDirection;
}): string {
  // Type-in quizzes are always 日英: the prompt shows the Japanese meaning and
  // the user types the English word. We never ask the user to type Japanese,
  // regardless of quiz direction or whether the word is active by vocabulary or
  // by status.
  return params.word.english;
}

export function isTypeInAnswerCorrect(answer: string, correctAnswer: string): boolean {
  return answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
}

export function buildQuizAnswerOutcomePlan(params: {
  word: Word;
  isCorrect: boolean;
  recordProjectId: string;
}): QuizAnswerOutcomePlan {
  return {
    wordUpdates: {
      status: getStatusAfterAnswer(params.word.status, params.isCorrect),
      ...calculateNextReview(params.isCorrect, params.word),
    },
    wrongAnswer: params.isCorrect
      ? undefined
      : {
          wordId: params.word.id,
          english: params.word.english,
          japanese: params.word.japanese,
          projectId: params.recordProjectId,
          distractors: params.word.distractors,
        },
  };
}
