import type { Word } from '@/types';

export interface QuizPrefillWordInput {
  id: string;
  english: string;
  japanese: string;
  distractors?: string[];
  exampleSentence?: string;
}

export interface PrefilledQuizContent {
  distractors: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
}

export interface PrefillQuizContentOptions {
  batchSize?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface PrefillQuizContentResult {
  updatesByWordId: Map<string, PrefilledQuizContent>;
  failedWordIds: string[];
}

const DEFAULT_BATCH_SIZE = 30;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_ENDPOINT = '/api/generate-quiz-distractors';

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasValidDistractors(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length < 3) return false;
  if (value.length === 3 && value[0] === '選択肢1') return false;
  return value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function hasExampleSentence(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasAuthorizationHeader(headers: HeadersInit): boolean {
  if (headers instanceof Headers) {
    return headers.has('Authorization') || headers.has('authorization');
  }
  if (Array.isArray(headers)) {
    return headers.some(([name]) => name.toLowerCase() === 'authorization');
  }
  return Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');
}

function normalizeSeedWords(words: QuizPrefillWordInput[]): QuizPrefillWordInput[] {
  const byId = new Map<string, QuizPrefillWordInput>();

  for (const word of words) {
    if (byId.has(word.id)) continue;
    byId.set(word.id, word);
  }

  return Array.from(byId.values());
}

function buildSeedWords(words: QuizPrefillWordInput[]): QuizPrefillWordInput[] {
  return normalizeSeedWords(words).filter((word) => {
    const english = word.english.trim();
    const japanese = word.japanese.trim();
    if (!english || !japanese) return false;
    return !hasValidDistractors(word.distractors) || !hasExampleSentence(word.exampleSentence);
  });
}

function applyUpdateToWord(word: Word, update: PrefilledQuizContent | undefined): Word {
  if (!update) return word;
  return {
    ...word,
    distractors: update.distractors,
    ...(update.exampleSentence
      ? {
          exampleSentence: update.exampleSentence,
          exampleSentenceJa: update.exampleSentenceJa ?? '',
        }
      : {}),
  };
}

export function mergePrefilledQuizContent(
  words: Word[],
  updatesByWordId: Map<string, PrefilledQuizContent>
): Word[] {
  return words.map((word) => applyUpdateToWord(word, updatesByWordId.get(word.id)));
}

export async function prefillQuizContent(
  words: QuizPrefillWordInput[],
  headers: HeadersInit,
  options: PrefillQuizContentOptions = {}
): Promise<PrefillQuizContentResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;

  const updatesByWordId = new Map<string, PrefilledQuizContent>();
  const failedWordIds = new Set<string>();

  const seedWords = buildSeedWords(words);
  if (seedWords.length === 0) {
    return { updatesByWordId, failedWordIds: [] };
  }

  const batches = chunkArray(seedWords, batchSize);

  for (const batch of batches) {
    let pendingWords = batch;

    for (let attempt = 1; attempt <= maxAttempts && pendingWords.length > 0; attempt += 1) {
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            words: pendingWords.map((word) => ({
              id: word.id,
              english: word.english,
              japanese: word.japanese,
            })),
          }),
        });

        if (!response.ok) {
          throw new Error(`prefill request failed: ${response.status}`);
        }

        const data = await response.json() as {
          success?: boolean;
          results?: Array<{
            wordId?: string;
            distractors?: string[];
            exampleSentence?: string;
            exampleSentenceJa?: string;
          }>;
        };

        if (!data.success || !Array.isArray(data.results)) {
          throw new Error('prefill response format is invalid');
        }

        const succeededWordIds = new Set<string>();

        for (const result of data.results) {
          if (!result?.wordId || !Array.isArray(result.distractors) || result.distractors.length === 0) continue;

          succeededWordIds.add(result.wordId);
          updatesByWordId.set(result.wordId, {
            distractors: result.distractors,
            ...(result.exampleSentence?.trim()
              ? {
                  exampleSentence: result.exampleSentence.trim(),
                  exampleSentenceJa: result.exampleSentenceJa?.trim() || '',
                }
              : {}),
          });
        }

        pendingWords = pendingWords.filter((word) => !succeededWordIds.has(word.id));
        if (pendingWords.length > 0 && attempt < maxAttempts) {
          await sleepImpl(retryBaseDelayMs * attempt);
        }
      } catch {
        if (attempt < maxAttempts) {
          await sleepImpl(retryBaseDelayMs * attempt);
        }
      }
    }

    for (const failed of pendingWords) {
      failedWordIds.add(failed.id);
    }
  }

  return {
    updatesByWordId,
    failedWordIds: Array.from(failedWordIds),
  };
}

