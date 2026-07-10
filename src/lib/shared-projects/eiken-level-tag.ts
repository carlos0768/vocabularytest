import { CEFR_LEVEL_ORDER, EIKEN_TO_CEFR_BAND, type CefrLevel } from '@/lib/reels/eiken-cefr';
import { EIKEN_LEVEL_ORDER } from '@/lib/ai/prompts/eiken';
import { lookupLexiconCefrLevels, type EikenCefrFilterDeps } from '@/lib/lexicon/eiken-cefr-filter';
import { normalizeHeadword } from '../../../shared/lexicon';

/** User-facing discovery tag per EIKEN grade, e.g. `英検準1級`. */
export const EIKEN_LEVEL_TAG_LABELS: Record<string, string> = {
  '5': '英検5級',
  '4': '英検4級',
  '3': '英検3級',
  pre2: '英検準2級',
  '2': '英検2級',
  pre1: '英検準1級',
  '1': '英検1級',
};

const EIKEN_LEVEL_TAG_PATTERN = /^[#＃]?英検準?[1-5]級$/;

/**
 * Words with a lexicon CEFR level below this count are too few to call a
 * level for the whole wordbook, so no tag is emitted.
 */
export const MIN_KNOWN_WORDS_FOR_LEVEL_TAG = 3;

function cefrIndex(level: string): number {
  return CEFR_LEVEL_ORDER.indexOf(level.toUpperCase() as CefrLevel);
}

/** Midpoint of a grade's CEFR band on the A1..C2 index scale. */
function bandCenter(eikenLevel: string): number | null {
  const band = EIKEN_TO_CEFR_BAND[eikenLevel];
  if (!band || band.length === 0) return null;
  const indices = band.map(cefrIndex).filter((index) => index !== -1);
  if (indices.length === 0) return null;
  return indices.reduce((sum, index) => sum + index, 0) / indices.length;
}

/**
 * Estimate the EIKEN grade that best matches a wordbook from the CEFR
 * levels of its words: average the known levels, then pick the grade whose
 * CEFR band midpoint is closest (ties resolve to the harder grade).
 */
export function estimateEikenLevelFromCefr(cefrLevels: readonly string[]): string | null {
  const indices = cefrLevels.map(cefrIndex).filter((index) => index !== -1);
  if (indices.length < MIN_KNOWN_WORDS_FOR_LEVEL_TAG) return null;

  const score = indices.reduce((sum, index) => sum + index, 0) / indices.length;

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const level of EIKEN_LEVEL_ORDER) {
    const center = bandCenter(level);
    if (center === null) continue;
    const distance = Math.abs(center - score);
    if (distance <= bestDistance) {
      best = level;
      bestDistance = distance;
    }
  }

  return best;
}

export function isEikenLevelTag(tag: string): boolean {
  return EIKEN_LEVEL_TAG_PATTERN.test(tag.trim());
}

/**
 * Drop any stale EIKEN grade tag and prepend the freshly computed one so it
 * always survives the shared-tag count cap and tracks the current words.
 */
export function mergeEikenLevelTag(tags: readonly string[], levelTag: string | null): string[] {
  const withoutLevelTags = tags.filter((tag) => !isEikenLevelTag(tag));
  return levelTag ? [levelTag, ...withoutLevelTags] : withoutLevelTags;
}

/**
 * Compute the EIKEN grade tag for a set of words by looking up their CEFR
 * levels in the lexicon. Fail-open: any lookup failure returns null so
 * publishing is never blocked by the tagging step.
 */
export async function computeEikenLevelTagForWords(
  englishWords: readonly string[],
  deps: EikenCefrFilterDeps = {},
): Promise<string | null> {
  const headwords = englishWords
    .map((english) => normalizeHeadword(english))
    .filter((headword) => headword.length > 0);
  if (headwords.length === 0) return null;

  try {
    const lookup = deps.lookupCefrLevels
      ?? ((normalizedHeadwords: string[]) => lookupLexiconCefrLevels(normalizedHeadwords, deps));
    const levels = await lookup(headwords);
    const cefrLevels = headwords
      .map((headword) => levels.get(headword))
      .filter((level): level is CefrLevel => Boolean(level));
    const eikenLevel = estimateEikenLevelFromCefr(cefrLevels);
    return eikenLevel ? EIKEN_LEVEL_TAG_LABELS[eikenLevel] ?? null : null;
  } catch (error) {
    console.warn('[eiken-level-tag] lexicon lookup failed, skipping level tag', error);
    return null;
  }
}
