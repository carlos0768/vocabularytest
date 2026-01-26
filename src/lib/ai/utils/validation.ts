/**
 * Validation Utilities
 *
 * AIレスポンスの検証に関するユーティリティ。
 */

import type { AIWordExtraction } from '@/types';

// Use AIWordExtraction type for individual word data
type WordData = AIWordExtraction;

/**
 * 単語データの基本検証
 *
 * @param word 検証する単語データ
 * @returns 有効な場合はtrue
 */
export function isValidWord(word: unknown): word is WordData {
  if (!word || typeof word !== 'object') return false;

  const w = word as Record<string, unknown>;

  return (
    typeof w.english === 'string' &&
    w.english.length > 0 &&
    typeof w.japanese === 'string' &&
    w.japanese.length > 0 &&
    Array.isArray(w.distractors) &&
    w.distractors.length >= 3 &&
    w.distractors.every((d: unknown) => typeof d === 'string')
  );
}

/**
 * 単語配列を検証してフィルタリング
 *
 * @param words 検証する配列
 * @returns 有効な単語のみの配列
 */
export function filterValidWords(words: unknown[]): WordData[] {
  return words.filter(isValidWord);
}

/**
 * 単語データを正規化（不足フィールドを補完）
 *
 * @param word 正規化する単語データ
 * @returns 正規化された単語データ
 */
export function normalizeWord(word: Partial<WordData>): WordData | null {
  if (!word.english || !word.japanese) {
    return null;
  }

  return {
    english: word.english.trim(),
    japanese: word.japanese.trim(),
    distractors: word.distractors || [],
    exampleSentence: word.exampleSentence?.trim(),
    exampleSentenceJa: word.exampleSentenceJa?.trim(),
  };
}

/**
 * 抽出結果の検証
 *
 * @param result 検証する結果
 * @returns 有効な場合はtrue
 */
export function isValidExtractionResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;

  const r = result as Record<string, unknown>;

  return 'words' in r && Array.isArray(r.words);
}

/**
 * 重複した単語を除去
 *
 * @param words 単語配列
 * @returns 重複を除去した配列
 */
export function removeDuplicateWords(words: WordData[]): WordData[] {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = word.english.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * distractorsが不足している場合にダミーを追加
 *
 * @param word 単語データ
 * @param minCount 最低distractor数（デフォルト3）
 * @returns 補完された単語データ
 */
export function ensureDistractors(word: WordData, minCount: number = 3): WordData {
  if (word.distractors.length >= minCount) {
    return word;
  }

  const dummyDistractors = ['選択肢A', '選択肢B', '選択肢C', '選択肢D'];
  const needed = minCount - word.distractors.length;

  return {
    ...word,
    distractors: [...word.distractors, ...dummyDistractors.slice(0, needed)],
  };
}
