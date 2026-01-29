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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: validTexts,
  });

  // Sort by index to ensure correct order
  return response.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}

/**
 * Embedding dimensions for OpenAI text-embedding-3-small
 */
export const EMBEDDING_DIMENSIONS = 1536;
