import type { QuizQuestion, Word } from '@/types';
import { shuffleArray } from '@/lib/utils';
import { sortWordsByPriority } from '@/lib/spaced-repetition';
import {
  buildLocalDistractorsFallback,
  DEFAULT_EN_DISTRACTOR_FALLBACKS,
  DEFAULT_JA_DISTRACTOR_FALLBACKS,
} from './fallback-options';

export type QuizDirection = 'en-to-ja' | 'ja-to-en';

export function hasPreparedDistractors(word: Pick<Word, 'distractors'>): boolean {
  if (!Array.isArray(word.distractors)) return false;
  if (word.distractors.length < 3) return false;
  if (word.distractors.length === 3 && word.distractors[0] === '選択肢1') return false;
  return word.distractors.every((item) => typeof item === 'string' && item.trim().length > 0);
}

export function buildQuizQuestions(
  words: Word[],
  count: number,
  direction: QuizDirection = 'en-to-ja'
): QuizQuestion[] {
  const selected = sortWordsByPriority(words).slice(0, count);

  return selected.map((word) => {
    if (direction === 'ja-to-en') {
      const englishCandidates = words
        .filter((w) => w.id !== word.id)
        .map((w) => w.english);
      const englishDistractors = buildLocalDistractorsFallback({
        correct: word.english,
        candidateValues: englishCandidates,
        fallbackValues: DEFAULT_EN_DISTRACTOR_FALLBACKS,
      });
      const allOptions = [word.english, ...englishDistractors];
      const shuffled = shuffleArray(allOptions);
      const correctIndex = shuffled.indexOf(word.english);

      return {
        word,
        options: shuffled,
        correctIndex,
      };
    }

    const localCandidates = hasPreparedDistractors(word) ? word.distractors : [];
    const projectCandidates = words
      .filter((w) => w.id !== word.id)
      .map((w) => w.japanese);
    const japaneseDistractors = buildLocalDistractorsFallback({
      correct: word.japanese,
      candidateValues: [...localCandidates, ...projectCandidates],
      fallbackValues: DEFAULT_JA_DISTRACTOR_FALLBACKS,
    });

    const allOptions = [word.japanese, ...japaneseDistractors];
    const shuffled = shuffleArray(allOptions);
    const correctIndex = shuffled.indexOf(word.japanese);

    return {
      word,
      options: shuffled,
      correctIndex,
    };
  });
}

