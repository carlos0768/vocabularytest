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

/**
 * 語源解析の「世代」番号。解析範囲（どの単語をAIに送るか・どこまでを構造ありと
 * みなすか）を広げたらインクリメントする。
 *
 * 「構造なし」と判定した単語は lexicon に none センチネルとしてキャッシュされ、
 * 二度とAIに送られない。範囲を広げても旧世代の none がそのまま残ると新しい
 * 解析対象にならないため、none センチネルにだけ世代番号を書き込み、
 * 旧世代のものはキャッシュミス扱いで1度だけ再解析する（`isStaleNoneMorphology`）。
 *
 * 表示可能な語源にはこのフィールドを付けない。単語行として保存される値
 * （/api/words/create の strict スキーマ）に未知フィールドを混ぜないため。
 *
 * 世代1: 接辞候補にマッチした単語のみ解析（接辞を含む分解だけを採用）
 * 世代2: 単一語の全てを解析対象にし、複合語・語根のみの分解も採用
 */
export const MORPHOLOGY_ANALYSIS_VERSION = 2;

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
  /** none センチネルの解析世代（`MORPHOLOGY_ANALYSIS_VERSION`）。 */
  analysis: z.number().int().min(1).max(1000).optional(),
});

/** AI 応答（1語分）のスキーマ */
export const morphologyAiResponseSchema = z.object({
  hasMorphology: z.boolean(),
  parts: z.array(morphologyPartSchema).max(8).optional().default([]),
  explanation: z.string().max(400).optional().default(''),
});

export type MorphologyAiResponse = z.output<typeof morphologyAiResponseSchema>;

/** 「語源構造なし」を表すキャッシュ用センチネル値（解析世代の刻印つき） */
export function buildNoneMorphology(
  analysisVersion: number = MORPHOLOGY_ANALYSIS_VERSION,
): WordMorphology {
  return { formula: [], explanation: '', version: 1, none: true, analysis: analysisVersion };
}

/**
 * 「構造なし」判定が現行より狭い解析世代のものか。true なら再解析する。
 * 表示可能な語源は世代が古くても作り直さない（コストに見合わないため）。
 */
export function isStaleNoneMorphology(
  morphology: WordMorphology | null | undefined,
): boolean {
  if (!morphology?.none) return false;
  return (morphology.analysis ?? 1) < MORPHOLOGY_ANALYSIS_VERSION;
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
