import type { Word } from '@/types';
import type { WrongAnswer } from '@/lib/utils';

/**
 * 間違えた記録 (localStorage) はあるが単語本体が見つからないとき、記録だけから
 * 復習用の単語を組み立てる。復習期限は過去 (即出題) に置く。
 */
export function buildFallbackWordFromWrongAnswer(wrongAnswer: WrongAnswer): Word {
  const timestamp = Number.isFinite(wrongAnswer.lastWrongAt) ? wrongAnswer.lastWrongAt : Date.now();

  return {
    id: wrongAnswer.wordId,
    projectId: wrongAnswer.projectId,
    english: wrongAnswer.english,
    japanese: wrongAnswer.japanese,
    distractors: wrongAnswer.distractors,
    status: 'review',
    createdAt: new Date(timestamp).toISOString(),
    lastReviewedAt: new Date(timestamp).toISOString(),
    nextReviewAt: new Date(0).toISOString(),
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
  };
}
