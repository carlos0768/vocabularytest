import { EIKEN_LEVEL_ORDER } from '@/lib/ai/prompts/eiken';

export const CEFR_LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export type CefrLevel = (typeof CEFR_LEVEL_ORDER)[number];

/**
 * Rough EIKEN grade → CEFR band mapping used for reel personalization.
 * A band lists the CEFR levels considered a perfect fit for that grade.
 */
export const EIKEN_TO_CEFR_BAND: Record<string, CefrLevel[]> = {
  '5': ['A1'],
  '4': ['A1', 'A2'],
  '3': ['A2'],
  pre2: ['A2', 'B1'],
  '2': ['B1'],
  pre1: ['B2'],
  '1': ['C1'],
};

function cefrIndex(level: string): number {
  return CEFR_LEVEL_ORDER.indexOf(level.toUpperCase() as CefrLevel);
}

/**
 * Distance (in CEFR steps) from a target band to an actual level.
 * 0 when the level is inside the band; null when either side is unknown.
 */
export function cefrDistance(band: CefrLevel[], actual: string | null | undefined): number | null {
  if (!actual) return null;
  const actualIndex = cefrIndex(actual);
  if (actualIndex === -1 || band.length === 0) return null;
  const indices = band.map(cefrIndex).filter((index) => index !== -1);
  if (indices.length === 0) return null;
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  if (actualIndex >= min && actualIndex <= max) return 0;
  return actualIndex < min ? min - actualIndex : actualIndex - max;
}

/** Index distance between two EIKEN grades; null when either is unknown. */
export function eikenDistance(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ai = EIKEN_LEVEL_ORDER.indexOf(a);
  const bi = EIKEN_LEVEL_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return null;
  return Math.abs(ai - bi);
}

/** EIKEN grades within ±range steps of the given grade (inclusive). */
export function eikenLevelsAround(level: string | null | undefined, range: number): string[] {
  if (!level) return [];
  const index = EIKEN_LEVEL_ORDER.indexOf(level);
  if (index === -1) return [];
  const start = Math.max(0, index - range);
  const end = Math.min(EIKEN_LEVEL_ORDER.length, index + range + 1);
  return EIKEN_LEVEL_ORDER.slice(start, end);
}
