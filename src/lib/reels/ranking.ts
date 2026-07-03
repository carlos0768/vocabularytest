import type { ReelCandidate, ReelRankingContext } from './types';
import { EIKEN_TO_CEFR_BAND, cefrDistance, eikenDistance } from './eiken-cefr';

const WEIGHT_LEVEL_FIT = 3.0;
const WEIGHT_TAG_AFFINITY = 2.0;
const WEIGHT_POPULARITY = 1.0;
const WEIGHT_RECENCY = 0.5;
const WEIGHT_JITTER = 1.0;
const WEIGHT_FEEDBACK = 1.5;

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
  const overlap =
    interests.size === 0
      ? 0
      : bookTags.filter((tag) => interests.has(tag)).length /
        Math.max(1, Math.min(3, bookTags.length));
  // Semantic similarity (pgvector) beats plain string overlap when present.
  const similarity = ctx.tagSimilarityByBookId?.[candidate.book.id] ?? 0;
  return Math.max(overlap, Math.min(1, Math.max(0, similarity)));
}

/** Book ref used by the feedback tables: 's:<shareId>' | 'o:<officialSlug>'. */
export function candidateBookRef(candidate: ReelCandidate): string | null {
  if (candidate.book.type === 'shared') {
    return candidate.book.shareId ? `s:${candidate.book.shareId}` : null;
  }
  return candidate.book.officialSlug ? `o:${candidate.book.officialSlug}` : null;
}

function feedbackBias(candidate: ReelCandidate, ctx: ReelRankingContext): number {
  const bookRef = candidateBookRef(candidate);
  if (!bookRef) return 0;
  let bias = 0;
  if (ctx.interestedBookRefs?.includes(bookRef)) bias += 1;
  const notInterested = ctx.notInterestedBookCounts?.[bookRef] ?? 0;
  if (notInterested > 0) bias -= Math.min(1, notInterested / 3);
  return bias;
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
    WEIGHT_JITTER * jitter +
    WEIGHT_FEEDBACK * feedbackBias(candidate, ctx)
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

export type ReelSelection = { candidate: ReelCandidate; recycled: boolean };

/**
 * Select up to `limit` candidates for a feed page, never running dry:
 * unseen candidates are ranked first; any shortfall is filled by
 * recycling seen candidates as review cards, least-recently-seen first.
 * Pure and deterministic for a given (candidates, seenAtByKey, ctx, seed).
 */
export function selectReelCandidates(
  candidates: ReelCandidate[],
  seenAtByKey: Record<string, string>,
  ctx: ReelRankingContext,
  seed: number,
  limit: number,
): ReelSelection[] {
  if (limit <= 0 || candidates.length === 0) return [];

  const unseen = candidates.filter((candidate) => seenAtByKey[candidate.id] === undefined);
  const picked: ReelSelection[] = rankReelCandidates(unseen, ctx, seed, limit).map(
    (candidate) => ({ candidate, recycled: false }),
  );

  const needed = limit - picked.length;
  if (needed <= 0) return picked;

  // LRU recycle pool: seen candidates, oldest seen_at first. Ties broken
  // by id so the order stays deterministic.
  const recyclePool = candidates
    .filter((candidate) => seenAtByKey[candidate.id] !== undefined)
    .sort(
      (a, b) =>
        seenAtByKey[a.id].localeCompare(seenAtByKey[b.id]) || a.id.localeCompare(b.id),
    )
    .slice(0, needed * 3);

  for (const candidate of rankReelCandidates(recyclePool, ctx, seed, needed)) {
    picked.push({ candidate, recycled: true });
  }

  return picked;
}
