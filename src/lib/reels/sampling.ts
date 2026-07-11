import { normalizeHeadword } from '../../../shared/lexicon';
import type { CefrLevel } from './eiken-cefr';
import { hashString, mulberry32 } from './ranking';
import type { ReelCandidate } from './types';

export type WordSamplingOptions = {
  /** page-scoped seed (buildReelFeedPage's rankSeed) so each page rotates */
  seed: number;
  /** mixed into the seed so each book rotates independently */
  bookId: string;
  /** item keys the user has already seen (soft-deprioritized) */
  seenKeys: ReadonlySet<string>;
  /** item keys marked not-interested (hard-excluded) */
  excludedKeys: ReadonlySet<string>;
};

/**
 * Even-spread pick (same coverage as the old spreadPick) rotated by a
 * starting offset, so different offsets surface different words from the
 * same book. Indices stay distinct because the un-rotated indices are
 * strictly increasing and all < items.length.
 */
function rotatedSpreadPick<T>(items: readonly T[], count: number, offset: number): T[] {
  if (items.length <= count) return [...items];
  const picked: T[] = [];
  const step = items.length / count;
  for (let i = 0; i < count; i += 1) {
    picked.push(items[(offset + Math.floor(i * step)) % items.length]);
  }
  return picked;
}

/**
 * Pick up to `count` words from one book, deterministically for a given
 * (seed, bookId): excluded keys are dropped, unseen words are picked first
 * via a seed-rotated even spread, and any shortfall is filled from seen
 * words so the recycle pool never runs dry.
 */
export function sampleBookWords<T>(
  words: readonly T[],
  count: number,
  keyOf: (word: T) => string,
  options: WordSamplingOptions,
): T[] {
  if (count <= 0) return [];
  const eligible = words.filter((word) => !options.excludedKeys.has(keyOf(word)));
  if (eligible.length <= count) return eligible;

  const unseen: T[] = [];
  const seen: T[] = [];
  for (const word of eligible) {
    (options.seenKeys.has(keyOf(word)) ? seen : unseen).push(word);
  }

  const rand = mulberry32((options.seed ^ hashString(options.bookId)) >>> 0);
  const picked = rotatedSpreadPick(unseen, count, Math.floor(rand() * Math.max(1, unseen.length)));

  const needed = count - picked.length;
  if (needed > 0 && seen.length > 0) {
    picked.push(...rotatedSpreadPick(seen, needed, Math.floor(rand() * seen.length)));
  }

  return picked;
}

/** Normalized headwords of shared candidates still missing a CEFR level. */
export function sharedCefrLookupHeadwords(candidates: ReelCandidate[]): string[] {
  return candidates
    .filter((candidate) => candidate.source === 'shared' && candidate.cefrLevel === null)
    .map((candidate) => normalizeHeadword(candidate.english));
}

/**
 * Fill cefrLevel on shared candidates from a normalized-headword → CEFR map
 * (lexicon lookup), so levelFit can personalize shared words too. Official
 * candidates and words missing from the map are left untouched.
 */
export function withSharedCefrLevels(
  candidates: ReelCandidate[],
  levels: Map<string, CefrLevel>,
): ReelCandidate[] {
  if (levels.size === 0) return candidates;
  return candidates.map((candidate) => {
    if (candidate.source !== 'shared' || candidate.cefrLevel !== null) return candidate;
    const level = levels.get(normalizeHeadword(candidate.english));
    return level ? { ...candidate, cefrLevel: level } : candidate;
  });
}
