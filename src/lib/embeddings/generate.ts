import OpenAI from 'openai';

/**
 * Generate embedding for a single word using OpenAI text-embedding-3-small
 * @param text - The word or phrase to generate embedding for
 * @returns 1536-dimensional embedding vector
 */
export async function generateWordEmbedding(text: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple words in a single API call
 * More efficient than calling generateWordEmbedding multiple times
 * @param texts - Array of words or phrases
 * @returns Array of 1536-dimensional embedding vectors
 */
export async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
  // Filter out empty/whitespace-only strings (OpenAI rejects them)
  const validTexts = texts.map(t => t.trim()).filter(t => t.length > 0);

  if (validTexts.length === 0) {
    return [];
  }

  // Deduplicate identical strings within the same batch to reduce API token costs.
  const uniqueTexts: string[] = [];
  const validToUniqueIndex: number[] = [];
  const uniqueIndexByText = new Map<string, number>();

  for (const text of validTexts) {
    const existingIndex = uniqueIndexByText.get(text);
    if (existingIndex !== undefined) {
      validToUniqueIndex.push(existingIndex);
      continue;
    }

    const nextIndex = uniqueTexts.length;
    uniqueTexts.push(text);
    uniqueIndexByText.set(text, nextIndex);
    validToUniqueIndex.push(nextIndex);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: uniqueTexts,
  });

  const uniqueEmbeddings = response.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);

  return validToUniqueIndex.map((uniqueIndex) => uniqueEmbeddings[uniqueIndex]);
}

/**
 * Embedding dimensions for OpenAI text-embedding-3-small
 */
export const EMBEDDING_DIMENSIONS = 1536;
