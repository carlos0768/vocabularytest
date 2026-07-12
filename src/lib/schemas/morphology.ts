/**
 * 語源解析（morphology）関連の Zod スキーマ。
 *
 * - `morphologyAiResponseSchema`: AI 応答（1語分）の検証
 * - `wordMorphologySchema`: 保存値 (WordMorphology) の検証。
 *   /api/words/create の `.strict()` スキーマからも再利用する。
 */

import { z } from 'zod';
import type { WordMorphology } from '../../../shared/types';

export const MORPHOLOGY_PART_KINDS = ['prefix', 'suffix', 'infix', 'root'] as const;

/** explanation を最大2行にクランプする（余分な行は捨てる） */
export function clampExplanationLines(explanation: string, maxLines = 2): string {
  const lines = explanation
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.slice(0, maxLines).join('\n');
}

const morphologyPartSchema = z.object({
  text: z.string().trim().min(1).max(40),
  kind: z.enum(MORPHOLOGY_PART_KINDS),
  meaningJa: z.string().trim().min(1).max(60),
  affixId: z.string().trim().min(1).max(60).optional(),
});

/** 保存値 (WordMorphology) のスキーマ。formula は最大8パーツ。 */
export const wordMorphologySchema = z.object({
  formula: z.array(morphologyPartSchema).max(8),
  explanation: z.string().max(200),
  version: z.literal(1),
  none: z.boolean().optional(),
});

/** AI 応答（1語分）のスキーマ */
export const morphologyAiResponseSchema = z.object({
  hasMorphology: z.boolean(),
  parts: z.array(morphologyPartSchema).max(8).optional().default([]),
  explanation: z.string().max(400).optional().default(''),
});

export type MorphologyAiResponse = z.output<typeof morphologyAiResponseSchema>;

/** 「接辞構造なし」を表すキャッシュ用センチネル値 */
export function buildNoneMorphology(): WordMorphology {
  return { formula: [], explanation: '', version: 1, none: true };
}

/**
 * 保存値として妥当な WordMorphology かを検証して返す。
 * DB から読んだ jsonb など unknown 値の正規化に使う。
 */
export function normalizeWordMorphology(value: unknown): WordMorphology | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const parsed = wordMorphologySchema.safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data as WordMorphology;
}
