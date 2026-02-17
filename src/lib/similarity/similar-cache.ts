import { findLocalSimilarWords } from '@/lib/similarity/local-similar-words';
import { fetchVectorSimilarWords } from '@/lib/similarity/vector-similar';

export type SimilarSource = 'vector' | 'local';

export interface SimilarSourceWord {
  id: string;
  english: string;
  japanese: string;
  embedding?: unknown;
}

export interface SimilarCandidate {
  id: string;
  english: string;
  japanese: string;
  similarity: number;
  source: SimilarSource;
}

export interface SimilarCacheRowInsert {
  user_id: string;
  source_word_id: string;
  similar_word_id: string;
  rank: number;
  similarity: number;
  source: SimilarSource;
  updated_at: string;
}

interface BuildCandidatesParams {
  supabase: {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
  sourceWord: SimilarSourceWord;
  allUserWords: Array<Pick<SimilarSourceWord, 'id' | 'english' | 'japanese'>>;
  limit?: number;
  vectorThreshold?: number;
  vectorCount?: number;
}

interface BuildImpactedIdsParams {
  supabase: {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
  newWords: SimilarSourceWord[];
  threshold?: number;
  count?: number;
  maxImpacted?: number;
  concurrency?: number;
}

function normalizeSource(source: unknown): SimilarSource {
  return source === 'local' ? 'local' : 'vector';
}

function uniqueById(items: SimilarCandidate[]): SimilarCandidate[] {
  const seen = new Set<string>();
  const unique: SimilarCandidate[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

export function mergeWithLocalFallback(params: {
  sourceWord: Pick<SimilarSourceWord, 'id' | 'english' | 'japanese'>;
  allUserWords: Array<Pick<SimilarSourceWord, 'id' | 'english' | 'japanese'>>;
  vectorResults: SimilarCandidate[];
  limit?: number;
}): SimilarCandidate[] {
  const limit = params.limit ?? 3;
  const vectorResults = uniqueById(params.vectorResults).slice(0, limit);
  const neededCount = Math.max(0, limit - vectorResults.length);

  if (neededCount === 0) {
    return vectorResults;
  }

  const localResults = findLocalSimilarWords(params.sourceWord, params.allUserWords, {
    limit: neededCount,
    excludeIds: [params.sourceWord.id, ...vectorResults.map((item) => item.id)],
  }).map((item) => ({
    id: item.id,
    english: item.english,
    japanese: item.japanese,
    similarity: item.score,
    source: 'local' as const,
  }));

  return [...vectorResults, ...localResults].slice(0, limit);
}

export async function buildSimilarCandidatesForSource(params: BuildCandidatesParams): Promise<SimilarCandidate[]> {
  const limit = params.limit ?? 3;
  let vectorResults: SimilarCandidate[] = [];

  try {
    vectorResults = (await fetchVectorSimilarWords({
      supabase: params.supabase,
      userId: params.userId,
      sourceWordId: params.sourceWord.id,
      sourceEmbedding: params.sourceWord.embedding ?? null,
      threshold: params.vectorThreshold ?? 0.4,
      count: params.vectorCount ?? 20,
      excludeWordIds: [params.sourceWord.id],
    })).map((item) => ({
      id: item.id,
      english: item.english,
      japanese: item.japanese,
      similarity: item.similarity,
      source: 'vector' as const,
    }));
  } catch (error) {
    console.error('Vector similar lookup failed while building cache:', error);
  }

  return mergeWithLocalFallback({
    sourceWord: params.sourceWord,
    allUserWords: params.allUserWords,
    vectorResults,
    limit,
  });
}

export function toCacheRows(params: {
  userId: string;
  sourceWordId: string;
  candidates: SimilarCandidate[];
  updatedAt?: string;
}): SimilarCacheRowInsert[] {
  const updatedAt = params.updatedAt ?? new Date().toISOString();
  return params.candidates.slice(0, 3).map((candidate, index) => ({
    user_id: params.userId,
    source_word_id: params.sourceWordId,
    similar_word_id: candidate.id,
    rank: index + 1,
    similarity: candidate.similarity,
    source: normalizeSource(candidate.source),
    updated_at: updatedAt,
  }));
}

function dedupeIds(items: string[]): string[] {
  return Array.from(new Set(items));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }));

  return results;
}

export function selectImpactedExistingIds(params: {
  newWordIds: string[];
  nearbyIdsBySource: string[][];
  maxImpacted?: number;
}): string[] {
  const maxImpacted = params.maxImpacted ?? 300;
  const newWordSet = new Set(params.newWordIds);
  const impacted = new Set<string>();

  for (const nearbyIds of params.nearbyIdsBySource) {
    for (const candidateId of nearbyIds) {
      if (newWordSet.has(candidateId)) continue;
      if (impacted.has(candidateId)) continue;
      impacted.add(candidateId);
      if (impacted.size >= maxImpacted) {
        return Array.from(impacted);
      }
    }
  }

  return Array.from(impacted);
}

export async function collectImpactedExistingIds(params: BuildImpactedIdsParams): Promise<string[]> {
  const newWordIds = dedupeIds(params.newWords.map((word) => word.id));
  if (newWordIds.length === 0) return [];

  const nearbyIdsBySource = await mapWithConcurrency(
    params.newWords,
    params.concurrency ?? 4,
    async (sourceWord) => {
      try {
        const neighbors = await fetchVectorSimilarWords({
          supabase: params.supabase,
          userId: params.userId,
          sourceWordId: sourceWord.id,
          sourceEmbedding: sourceWord.embedding ?? null,
          threshold: params.threshold ?? 0.55,
          count: params.count ?? 30,
          excludeWordIds: newWordIds,
        });
        return neighbors.map((neighbor) => neighbor.id);
      } catch (error) {
        console.error('Failed to collect impacted existing ids:', error);
        return [];
      }
    },
  );

  return selectImpactedExistingIds({
    newWordIds,
    nearbyIdsBySource,
    maxImpacted: params.maxImpacted ?? 300,
  });
}
