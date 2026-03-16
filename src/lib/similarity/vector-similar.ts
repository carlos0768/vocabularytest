import { isEmbeddingsEnabled } from '@/lib/embeddings/feature';

export interface VectorSimilarWord {
  id: string;
  english: string;
  japanese: string;
  similarity: number;
}

interface FetchVectorSimilarWordsParams {
  supabase: {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
  sourceWordId: string;
  sourceEmbedding: unknown;
  excludeWordIds?: string[];
  threshold?: number;
  count?: number;
}

export function parseEmbeddingVector(embedding: unknown): number[] | null {
  const sanitize = (values: unknown[]): number[] | null => {
    const numbers = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    return numbers.length > 0 ? numbers : null;
  };

  if (Array.isArray(embedding)) {
    return sanitize(embedding);
  }

  if (typeof embedding === 'string') {
    const trimmed = embedding.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return sanitize(parsed);
      }
    } catch {
      // fall through
    }

    const vectorValues = trimmed
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return sanitize(vectorValues);
  }

  return null;
}

function toSafeSimilarity(value: unknown): number {
  const similarity = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(similarity) ? similarity : 0;
}

export async function fetchVectorSimilarWords(params: FetchVectorSimilarWordsParams): Promise<VectorSimilarWord[]> {
  if (!isEmbeddingsEnabled()) {
    return [];
  }

  const embedding = parseEmbeddingVector(params.sourceEmbedding);
  if (!embedding) return [];

  const excludeWordIds = Array.from(new Set([
    params.sourceWordId,
    ...(params.excludeWordIds ?? []),
  ]));

  const { data, error } = await params.supabase.rpc('match_words_by_embedding', {
    query_embedding: embedding,
    user_id_filter: params.userId,
    exclude_word_ids: excludeWordIds,
    match_threshold: params.threshold ?? 0.4,
    match_count: params.count ?? 20,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => ({
      id: typeof (row as { id?: unknown }).id === 'string' ? (row as { id: string }).id : '',
      english: typeof (row as { english?: unknown }).english === 'string'
        ? (row as { english: string }).english
        : '',
      japanese: typeof (row as { japanese?: unknown }).japanese === 'string'
        ? (row as { japanese: string }).japanese
        : '',
      similarity: toSafeSimilarity((row as { similarity?: unknown }).similarity),
    }))
    .filter((row) => Boolean(row.id));
}
