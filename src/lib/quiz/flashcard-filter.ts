/**
 * フラッシュカードに流す単語の絞り込み。
 *
 * 「保存済みだけ」「クイズで間違えたやつだけ」のように、山札そのものを細くして
 * 回すための軸。単語1件が持つ属性（と localStorage の誤答記録）だけで決まる
 * 純粋関数なので、通信もDBアクセスも要らない。
 *
 * 誤答回数は /words の絞り込みと同じ `wrongAnswers`（localStorage）由来なので、
 * 両画面で「間違えた単語」の意味がずれない。
 */

import type { Word } from '@/types';

export type FlashcardFilter = 'all' | 'favorite' | 'wrong' | 'unmastered';

export const FLASHCARD_FILTERS: { key: FlashcardFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'すべて', icon: 'style' },
  { key: 'favorite', label: '保存済み', icon: 'bookmark' },
  { key: 'wrong', label: '間違えた', icon: 'error' },
  { key: 'unmastered', label: '未習得', icon: 'target' },
];

export function isFlashcardFilter(value: string | null | undefined): value is FlashcardFilter {
  return value === 'all' || value === 'favorite' || value === 'wrong' || value === 'unmastered';
}

export function matchesFlashcardFilter(
  word: Word,
  filter: FlashcardFilter,
  wrongCounts: ReadonlyMap<string, number>,
): boolean {
  switch (filter) {
    case 'favorite':
      return Boolean(word.isFavorite);
    case 'wrong':
      return (wrongCounts.get(word.id) ?? 0) > 0;
    case 'unmastered':
      return word.status !== 'mastered';
    case 'all':
    default:
      return true;
  }
}

/** 山札の並び順は変えず、条件に合う単語だけを残す。 */
export function filterFlashcardWords(
  words: readonly Word[],
  filter: FlashcardFilter,
  wrongCounts: ReadonlyMap<string, number>,
): Word[] {
  if (filter === 'all') return [...words];
  return words.filter((word) => matchesFlashcardFilter(word, filter, wrongCounts));
}

/** 絞り込みチップに出す件数。0件の軸は選ばせない（空の山札にしないため）。 */
export function countFlashcardFilters(
  words: readonly Word[],
  wrongCounts: ReadonlyMap<string, number>,
): Record<FlashcardFilter, number> {
  const counts: Record<FlashcardFilter, number> = {
    all: words.length,
    favorite: 0,
    wrong: 0,
    unmastered: 0,
  };

  for (const word of words) {
    if (word.isFavorite) counts.favorite += 1;
    if ((wrongCounts.get(word.id) ?? 0) > 0) counts.wrong += 1;
    if (word.status !== 'mastered') counts.unmastered += 1;
  }

  return counts;
}
