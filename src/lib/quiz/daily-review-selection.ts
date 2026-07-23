import type { Word } from '@/types';
import type { WrongAnswer } from '@/lib/utils';

/**
 * 復習対象が上限を超えるときの絞り込み。
 * 優先順: 1) 何回も間違えている単語 (wrongCount 降順)
 *         2) CEFR が高い単語 (C2 > C1 > B2 > B1 > A2 > A1 > 不明)
 * limit <= 0 は無制限扱いでそのまま返す。
 */

const CEFR_RANK: Record<string, number> = { C2: 6, C1: 5, B2: 4, B1: 3, A2: 2, A1: 1 };

export function cefrRank(level: string | null | undefined): number {
  if (!level) return 0;
  return CEFR_RANK[level.trim().toUpperCase()] ?? 0;
}

export function selectDailyReviewWords(
  words: Word[],
  wrongAnswers: Pick<WrongAnswer, 'wordId' | 'wrongCount'>[],
  limit: number,
): Word[] {
  if (limit <= 0 || words.length <= limit) return words;
  const wrongCounts = new Map(wrongAnswers.map((entry) => [entry.wordId, entry.wrongCount]));
  return [...words]
    .sort(
      (a, b) =>
        (wrongCounts.get(b.id) ?? 0) - (wrongCounts.get(a.id) ?? 0) ||
        cefrRank(b.cefrLevel) - cefrRank(a.cefrLevel),
    )
    .slice(0, limit);
}
