/**
 * 派生語（derived words）関連の Zod スキーマ。
 *
 * - `derivedWordsAiResponseSchema`: AI 応答（1語分）の検証
 * - `wordDerivedWordsSchema`: 保存値 (WordDerivedWords) の検証。
 *   /api/words/create の `.strict()` スキーマからも再利用する。
 */

import { z } from 'zod';
import type { WordDerivedWords } from '../../../shared/types';

export const DERIVED_WORD_POS = ['noun', 'verb', 'adjective', 'adverb'] as const;

export const DERIVED_WORD_EXAM_TAGS = [
  'kyotsu',
  'kokkouritsu',
  'shiritsu',
  'toefl',
  'ielts',
  'eiken',
] as const;

/** 1語あたりの生成上限。ユーザー要件で最大3語 */
export const MAX_DERIVED_WORDS = 3;

const derivedWordItemSchema = z.object({
  english: z.string().trim().min(1).max(60),
  japanese: z.string().trim().min(1).max(60),
  partOfSpeech: z.enum(DERIVED_WORD_POS),
  examTags: z.array(z.enum(DERIVED_WORD_EXAM_TAGS)).max(6).optional(),
});

/** 保存値 (WordDerivedWords) のスキーマ。items は最大3件。 */
export const wordDerivedWordsSchema = z.object({
  items: z.array(derivedWordItemSchema).max(MAX_DERIVED_WORDS),
  version: z.literal(1),
  none: z.boolean().optional(),
});

/**
 * AI 応答（1語分）のスキーマ。
 * AI は上限を超えて返してくることがあるので、件数はここでは絞らず
 * `toWordDerivedWords()` 側で切り詰める（超過を検証エラーにすると
 * 生成全体が無駄になるため）。
 */
export const derivedWordsAiResponseSchema = z.object({
  hasDerivedWords: z.boolean(),
  items: z.array(derivedWordItemSchema).max(12).optional().default([]),
});

export type DerivedWordsAiResponse = z.output<typeof derivedWordsAiResponseSchema>;

/** 「派生語なし」を表すキャッシュ用センチネル値 */
export function buildNoneDerivedWords(): WordDerivedWords {
  return { items: [], version: 1, none: true };
}

/**
 * 保存値として妥当な WordDerivedWords かを検証して返す。
 * DB から読んだ jsonb など unknown 値の正規化に使う。
 */
export function normalizeWordDerivedWords(value: unknown): WordDerivedWords | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const parsed = wordDerivedWordsSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data as WordDerivedWords;
}
