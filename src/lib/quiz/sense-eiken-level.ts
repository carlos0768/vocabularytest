/**
 * 多義語の語義（sense）を学習者の英検レベルで絞り込む純粋ロジック。
 *
 * 多義語は語義ごとに別問題として出題する（`translation-targets.ts`）が、
 * 学習者のレベルから見て明らかに易しい語義まで出題すると学習価値が薄い。
 * 例: 準1級（CEFR B2帯）の学習者に "right = 右"（A1）を出しても意味がない。
 * そこで「英検級のしきい値より CEFR で2段以上易しい語義」を出題対象から外す。
 *
 * - しきい値は `getEikenCefrThreshold()`（英検級 → CEFRバンド下限）
 * - 許容幅 `SENSE_EIKEN_CEFR_TOLERANCE` = 2段。しきい値の1段下までは残す
 *   （準1級なら B1 は残し、A2/A1 を落とす）
 * - CEFR不明の語義は落とさない（マスターのレベル欠損で出題が消えるのを防ぐ）
 * - 全語義が落ちる場合は最も難しい語義を1つ残す（単語が丸ごと出題不能になるのを防ぐ）
 */

import { CEFR_LEVEL_ORDER, cefrIndex, getEikenCefrThreshold } from '@/lib/reels/eiken-cefr';

/** しきい値から何段易しければ「簡単すぎる」と判定するか。 */
export const SENSE_EIKEN_CEFR_TOLERANCE = 2;

export interface SenseLevelCandidate {
  /** その語義のCEFRレベル（不明なら undefined）。 */
  cefrLevel?: string | null;
  /** 単語の主要語義（primary sense）かどうか。同点時の優先に使う。 */
  isPrimary?: boolean;
}

export function normalizeCefrLevel(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return (CEFR_LEVEL_ORDER as readonly string[]).includes(normalized) ? normalized : undefined;
}

/**
 * その語義が指定英検級の学習者にとって簡単すぎるか。
 * レベル不明・英検級不明の場合は false（出題対象として残す）。
 */
export function isSenseTooEasyForEikenLevel(
  cefrLevel: string | null | undefined,
  eikenLevel: string | null | undefined,
): boolean {
  const threshold = getEikenCefrThreshold(eikenLevel);
  if (!threshold) return false;
  const level = normalizeCefrLevel(cefrLevel);
  if (!level) return false;
  return cefrIndex(threshold) - cefrIndex(level) >= SENSE_EIKEN_CEFR_TOLERANCE;
}

/**
 * 同じ単語の語義候補を英検レベルで絞る。
 * 全滅する場合は最も難しい語義（同レベルなら primary）を1つだけ残す。
 */
export function filterSensesByEikenLevel<T extends SenseLevelCandidate>(
  senses: readonly T[],
  eikenLevel: string | null | undefined,
): T[] {
  if (senses.length === 0) return [];
  const threshold = getEikenCefrThreshold(eikenLevel);
  if (!threshold) return [...senses];

  const kept = senses.filter((sense) => !isSenseTooEasyForEikenLevel(sense.cefrLevel, eikenLevel));
  if (kept.length > 0) return kept;

  // 全語義がしきい値より易しい単語（例: 準1級学習者の "right"）。
  // 出題が0件になるより、その単語の中で最も難しい語義を残す方が有益。
  const hardest = senses.reduce((best, sense) => {
    const bestIndex = cefrIndex(normalizeCefrLevel(best.cefrLevel) ?? 'A1');
    const senseIndex = cefrIndex(normalizeCefrLevel(sense.cefrLevel) ?? 'A1');
    if (senseIndex !== bestIndex) return senseIndex > bestIndex ? sense : best;
    return best.isPrimary ? best : sense;
  });
  return [hardest];
}
