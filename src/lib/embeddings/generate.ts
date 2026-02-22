import OpenAI from 'openai';
import { recordApiCostEvent } from '@/lib/api-cost/recorder';

/**
 * Generate embedding for a single word using OpenAI text-embedding-3-small
 * @param text - The word or phrase to generate embedding for
 * @returns 1536-dimensional embedding vector
 */
export async function generateWordEmbedding(text: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    await recordApiCostEvent({
      provider: 'openai',
      model: 'text-embedding-3-small',
      operation: 'embeddings.generate_word',
      status: 'succeeded',
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: 0,
      totalTokens: response.usage?.total_tokens ?? null,
      metadata: {
        input_count: 1,
      },
    });

    return response.data[0].embedding;
  } catch (error) {
    await recordApiCostEvent({
      provider: 'openai',
      model: 'text-embedding-3-small',
      operation: 'embeddings.generate_word',
      status: 'failed',
      metadata: {
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      },
    });
    throw error;
  }
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

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: validTexts,
    });

    await recordApiCostEvent({
      provider: 'openai',
      model: 'text-embedding-3-small',
      operation: 'embeddings.batch_generate',
      status: 'succeeded',
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: 0,
      totalTokens: response.usage?.total_tokens ?? null,
      metadata: {
        input_count: validTexts.length,
      },
    });

    // Sort by index to ensure correct order
    return response.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  } catch (error) {
    await recordApiCostEvent({
      provider: 'openai',
      model: 'text-embedding-3-small',
      operation: 'embeddings.batch_generate',
      status: 'failed',
      metadata: {
        input_count: validTexts.length,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      },
    });
    throw error;
  }
}

/**
 * Embedding dimensions for OpenAI text-embedding-3-small
 */
export const EMBEDDING_DIMENSIONS = 1536;
