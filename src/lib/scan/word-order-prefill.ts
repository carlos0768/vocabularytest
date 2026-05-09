import {
  generateWordOrderQuizForWords,
  type GeneratedWordOrderQuizResult,
  type WordOrderQuizWordInput,
} from '@/lib/ai/generate-word-order-quiz';
import {
  isWordOrderEligible,
  normalizeWordOrderQuizCache,
} from '@/lib/quiz/word-order';
import type { WordOrderQuizCache } from '@/types';

export const WORD_ORDER_PREFILL_BATCH_SIZE = 30;

export interface WordOrderQuizPrefillCandidateWord {
  id: string;
  english: string;
  japanese: string;
  word_order_quiz?: unknown | null;
  wordOrderQuiz?: unknown | null;
}

export interface WordOrderQuizPrefillSummary {
  requested: number;
  generated: number;
  persisted: number;
  failed: number;
}

export interface WordOrderQuizUpdateClient {
  from(table: 'words'): {
    update(payload: Record<string, unknown>): {
      eq(column: 'id', value: string): PromiseLike<{ error: { message?: string } | null }>;
    };
  };
}

export interface PrefillWordOrderQuizzesOptions {
  getUpdateClient: () => WordOrderQuizUpdateClient;
  generate?: (words: WordOrderQuizWordInput[]) => Promise<GeneratedWordOrderQuizResult[]>;
  batchSize?: number;
}

function getExistingWordOrderQuizCache(word: WordOrderQuizPrefillCandidateWord): WordOrderQuizCache | null {
  return normalizeWordOrderQuizCache(
    word,
    word.word_order_quiz ?? word.wordOrderQuiz,
  );
}

export function buildWordOrderQuizPrefillSeedWords(
  words: WordOrderQuizPrefillCandidateWord[],
): WordOrderQuizWordInput[] {
  return words
    .filter((word) =>
      isWordOrderEligible(word) &&
      word.japanese.trim().length > 0 &&
      !getExistingWordOrderQuizCache(word)
    )
    .map((word) => ({
      id: word.id,
      english: word.english,
      japanese: word.japanese,
    }));
}

export function buildWordOrderQuizUpdatePayload(
  quiz: WordOrderQuizCache,
): Record<string, unknown> {
  return {
    word_order_quiz: quiz,
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function prefillWordOrderQuizzesForWords(
  words: WordOrderQuizPrefillCandidateWord[],
  options: PrefillWordOrderQuizzesOptions,
): Promise<WordOrderQuizPrefillSummary> {
  const seedWords = buildWordOrderQuizPrefillSeedWords(words);
  const summary: WordOrderQuizPrefillSummary = {
    requested: seedWords.length,
    generated: 0,
    persisted: 0,
    failed: 0,
  };

  if (seedWords.length === 0) {
    return summary;
  }

  const generate = options.generate ?? generateWordOrderQuizForWords;
  const batchSize = options.batchSize ?? WORD_ORDER_PREFILL_BATCH_SIZE;

  for (const batch of chunkArray(seedWords, batchSize)) {
    let results: GeneratedWordOrderQuizResult[];
    try {
      results = await generate(batch);
    } catch {
      summary.failed += batch.length;
      continue;
    }

    summary.generated += results.length;
    const updateClient = options.getUpdateClient();
    for (const result of results) {
      try {
        const { error } = await updateClient
          .from('words')
          .update(buildWordOrderQuizUpdatePayload(result.quiz))
          .eq('id', result.wordId);
        if (error) {
          summary.failed += 1;
        } else {
          summary.persisted += 1;
        }
      } catch {
        summary.failed += 1;
      }
    }

    const missingResultCount = Math.max(0, batch.length - results.length);
    summary.failed += missingResultCount;
  }

  return summary;
}
