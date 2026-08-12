/**
 * 派生語の表示ヘルパー（単語詳細・デスクトップモーダルで共用）
 */

import type { DerivedWordExamTag, WordDerivedWords } from '../../../shared/types';

/** 表示すべき派生語を持っているか */
export function hasDisplayableDerivedWords(
  derivedWords: WordDerivedWords | null | undefined,
): derivedWords is WordDerivedWords {
  return Boolean(derivedWords && !derivedWords.none && derivedWords.items.length > 0);
}

export const DERIVED_WORD_POS_LABELS: Record<string, string> = {
  noun: '名',
  verb: '動',
  adjective: '形',
  adverb: '副',
};

export const DERIVED_WORD_EXAM_LABELS: Record<DerivedWordExamTag, string> = {
  kyotsu: '共通テスト',
  kokkouritsu: '国公立',
  shiritsu: '私大',
  toefl: 'TOEFL',
  ielts: 'IELTS',
  eiken: '英検',
};

export function formatExamTags(tags: DerivedWordExamTag[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return tags.map((tag) => DERIVED_WORD_EXAM_LABELS[tag] ?? tag);
}
