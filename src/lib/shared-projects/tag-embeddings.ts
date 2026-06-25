import OpenAI from 'openai';
import { readSingleLineEnv } from '@/lib/env';
import { formatSharedTag, normalizeSharedTags } from '../../../shared/shared-tags';

export const SHARED_TAG_EMBEDDING_MODEL = 'text-embedding-3-small';

let openaiClient: OpenAI | null = null;
let openaiClientKey: string | null = null;

function getOpenAIClient(apiKey: string): OpenAI {
  if (!openaiClient || openaiClientKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
    openaiClientKey = apiKey;
  }

  return openaiClient;
}

function getOpenAIApiKey(): string | null {
  const apiKey = readSingleLineEnv('OPENAI_API_KEY');
  return apiKey.trim() || null;
}

function buildSharedTagsEmbeddingInput(tags: readonly string[]): string {
  return [
    'Shared wordbook discovery tags',
    ...tags.map(formatSharedTag).filter(Boolean),
  ].join('\n');
}

async function createEmbedding(input: string): Promise<number[] | null> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  const response = await getOpenAIClient(apiKey).embeddings.create({
    model: SHARED_TAG_EMBEDDING_MODEL,
    input,
  });

  return response.data[0]?.embedding ?? null;
}

export async function createSharedTagsEmbedding(tags: readonly string[]): Promise<number[] | null> {
  const normalizedTags = normalizeSharedTags(tags);
  if (normalizedTags.length === 0) return null;

  return createEmbedding(buildSharedTagsEmbeddingInput(normalizedTags));
}

export async function createSharedSearchEmbedding(query: string): Promise<number[] | null> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return null;

  return createEmbedding(`Shared wordbook tag search\n${normalizedQuery}`);
}
