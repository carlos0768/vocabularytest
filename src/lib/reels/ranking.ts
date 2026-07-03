import type { ReelCandidate, ReelRankingContext } from './types';
import { EIKEN_TO_CEFR_BAND, cefrDistance, eikenDistance } from './eiken-cefr';

const WEIGHT_LEVEL_FIT = 3.0;
const WEIGHT_TAG_AFFINITY = 2.0;
const WEIGHT_POPULARITY = 1.0;
const WEIGHT_RECENCY = 0.5;
const WEIGHT_JITTER = 1.0;

/** Neutral level fit for words with no difficulty signal (shared words). */
const NEUTRAL_LEVEL_FIT = 0.5;
const MAX_ITEMS_PER_BOOK_PER_PAGE = 2;

/** Deterministic PRNG (mulberry32) so ranking is reproducible per seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small string hash (FNV-1a) used to derive a per-item jitter stream. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function levelFit(candidate: ReelCandidate, ctx: ReelRankingContext): number {
  if (!ctx.eikenLevel) return NEUTRAL_LEVEL_FIT;
  const band = EIKEN_TO_CEFR_BAND[ctx.eikenLevel] ?? [];

  const byCefr = cefrDistance(band, candidate.cefrLevel);
  if (byCefr !== null) {
    return 1 - Math.min(byCefr, 3) / 3;
  }

  const byEiken = eikenDistance(ctx.eikenLevel, candidate.book.eikenLevel);
  if (byEiken !== null) {
    return 1 - Math.min(byEiken, 3) / 3;
  }

  return NEUTRAL_LEVEL_FIT;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function tagAffinity(candidate: ReelCandidate, ctx: ReelRankingContext): number {
  const bookTags = candidate.book.sharedTags.map(normalizeTag).filter(Boolean);
  if (bookTags.length === 0) {
    // Official books have no shared tags — reward exact level match instead.
    if (candidate.book.type === 'official') {
      return candidate.book.eikenLevel && candidate.book.eikenLevel === ctx.eikenLevel ? 0.7 : 0.3;
    }
    return 0;
  }
  const interests = new Set(ctx.interestTags.map(normalizeTag).filter(Boolean));
  if (interests.size === 0) return 0;
  const overlap = bookTags.filter((tag) => interests.has(tag)).length;
  return overlap / Math.max(1, Math.min(3, bookTags.length));
}

function popularity(candidate: ReelCandidate): number {
  const likes = Math.max(0, candidate.book.likeCount);
  return Math.min(1, Math.log10(likes + 1) / 2);
}

function recency(candidate: ReelCandidate, ctx: ReelRankingContext): number {
  if (!candidate.book.createdAt) return 0;
  const created = Date.parse(candidate.book.createdAt);
  const now = Date.parse(ctx.now);
  if (Number.isNaN(created) || Number.isNaN(now)) return 0;
  const ageDays = Math.max(0, (now - created) / 86_400_000);
  return Math.exp(-ageDays / 14);
}

export function scoreReelCandidate(
  candidate: ReelCandidate,
  ctx: ReelRankingContext,
  seed: number,
): number {
  const jitter = mulberry32(seed ^ hashString(candidate.id))();
  return (
    WEIGHT_LEVEL_FIT * levelFit(candidate, ctx) +
    WEIGHT_TAG_AFFINITY * tagAffinity(candidate, ctx) +
    WEIGHT_POPULARITY * popularity(candidate) +
    WEIGHT_RECENCY * recency(candidate, ctx) +
    WEIGHT_JITTER * jitter
  );
}

/**
 * Rank candidates and pick up to `limit` items with book diversity:
 * never two consecutive items from the same book (unless nothing else
 * remains) and at most MAX_ITEMS_PER_BOOK_PER_PAGE per book.
 * Pure and deterministic for a given (candidates, ctx, seed).
 */
export function rankReelCandidates(
  candidates: ReelCandidate[],
  ctx: ReelRankingContext,
  seed: number,
  limit: number,
): ReelCandidate[] {
  if (limit <= 0 || candidates.length === 0) return [];

  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreReelCandidate(candidate, ctx, seed) }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  const picked: ReelCandidate[] = [];
  const perBook = new Map<string, number>();
  const remaining = scored.map((entry) => entry.candidate);

  while (picked.length < limit && remaining.length > 0) {
    const lastBookId = picked.length > 0 ? picked[picked.length - 1].book.id : null;
    let index = remaining.findIndex((candidate) => {
      const bookCount = perBook.get(candidate.book.id) ?? 0;
      if (bookCount >= MAX_ITEMS_PER_BOOK_PER_PAGE) return false;
      return candidate.book.id !== lastBookId;
    });
    if (index === -1) {
      // Relax the consecutive-book rule but keep the per-book cap.
      index = remaining.findIndex(
        (candidate) => (perBook.get(candidate.book.id) ?? 0) < MAX_ITEMS_PER_BOOK_PER_PAGE,
      );
    }
    if (index === -1) break;

    const [candidate] = remaining.splice(index, 1);
    picked.push(candidate);
    perBook.set(candidate.book.id, (perBook.get(candidate.book.id) ?? 0) + 1);
  }

  return picked;
}
