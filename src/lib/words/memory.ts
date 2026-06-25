import type { WordStatus } from '@/types';

export interface WordMemoryInput {
  id?: string;
  projectId?: string;
  english: string;
  japanese: string;
  status?: WordStatus;
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  lexiconDistinctKey?: string;
  lexiconSenseIsPrimary?: boolean;
}

export interface WordMemorySense<T extends WordMemoryInput = WordMemoryInput> {
  key: string;
  word: T;
  japanese: string;
  status: WordStatus;
  memoryRate: number;
  isPrimary: boolean;
}

export interface WordMemoryGroup<T extends WordMemoryInput = WordMemoryInput> {
  key: string;
  words: T[];
  senses: WordMemorySense<T>[];
  representative: T;
  memoryRate: number;
  status: WordStatus;
  isDistinctGroup: boolean;
}

export interface WordMemorySummary {
  total: number;
  mastered: number;
  learning: number;
  unlearned: number;
}

const STATUS_MEMORY_RATE: Record<WordStatus, number> = {
  new: 0,
  review: 50,
  mastered: 100,
};

const STATUS_RANK: Record<WordStatus, number> = {
  new: 0,
  review: 1,
  mastered: 2,
};

function normalizeKeyPart(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getWordMemoryRate(word: Pick<WordMemoryInput, 'status'>): number {
  return STATUS_MEMORY_RATE[word.status ?? 'new'];
}

export function getMemoryStatusFromRate(rate: number): WordStatus {
  if (rate >= 100) return 'mastered';
  if (rate <= 0) return 'new';
  return 'review';
}

export function getWordMemoryBaseKey(word: WordMemoryInput): string {
  const projectPrefix = word.projectId ? `${word.projectId}::` : '';
  if (word.lexiconEntryId) return `${projectPrefix}lex:${word.lexiconEntryId}`;
  return `${projectPrefix}en:${normalizeKeyPart(word.english)}`;
}

export function getWordMemorySenseKey(word: WordMemoryInput): string {
  const distinctKey = normalizeKeyPart(word.lexiconDistinctKey);
  if (distinctKey) return `distinct:${distinctKey}`;
  if (word.lexiconSenseIsPrimary) return 'primary';
  if (word.lexiconSenseId) return `sense:${word.lexiconSenseId}`;
  return `ja:${normalizeKeyPart(word.japanese)}`;
}

export function isPrimaryMeaningWord(word: WordMemoryInput): boolean {
  if (word.lexiconSenseIsPrimary === true) return true;
  if (word.lexiconSenseIsPrimary === false) return false;
  return !normalizeKeyPart(word.lexiconDistinctKey);
}

export function selectPrimaryMeaningWords<T extends WordMemoryInput>(words: readonly T[]): T[] {
  return words.filter(isPrimaryMeaningWord);
}

export function isSameWordMeaning(a: WordMemoryInput, b: WordMemoryInput): boolean {
  return getWordMemoryBaseKey(a) === getWordMemoryBaseKey(b)
    && getWordMemorySenseKey(a) === getWordMemorySenseKey(b);
}

function pickBestSenseWord<T extends WordMemoryInput>(current: T | undefined, incoming: T): T {
  if (!current) return incoming;
  const currentRank = STATUS_RANK[current.status ?? 'new'];
  const incomingRank = STATUS_RANK[incoming.status ?? 'new'];
  if (incomingRank !== currentRank) return incomingRank > currentRank ? incoming : current;
  return incoming;
}

export function groupWordsByMemory<T extends WordMemoryInput>(words: readonly T[]): WordMemoryGroup<T>[] {
  const buckets = new Map<string, T[]>();
  const passthrough: WordMemoryGroup<T>[] = [];

  words.forEach((word) => {
    const baseKey = getWordMemoryBaseKey(word);
    const bucket = buckets.get(baseKey);
    if (bucket) bucket.push(word);
    else buckets.set(baseKey, [word]);
  });

  for (const [key, bucketWords] of buckets.entries()) {
    const hasExplicitDistinct = bucketWords.some((word) =>
      normalizeKeyPart(word.lexiconDistinctKey).length > 0 ||
      Boolean(word.lexiconSenseId) ||
      typeof word.lexiconSenseIsPrimary === 'boolean'
    );
    const uniqueSenseKeys = new Set(bucketWords.map(getWordMemorySenseKey));
    const isDistinctGroup = hasExplicitDistinct && uniqueSenseKeys.size > 1;

    if (!isDistinctGroup) {
      for (const word of bucketWords) {
        const status = word.status ?? 'new';
        passthrough.push({
          key: word.id ? `word:${word.id}` : `${key}::${normalizeKeyPart(word.japanese)}`,
          words: [word],
          senses: [{
            key: getWordMemorySenseKey(word),
            word,
            japanese: word.japanese,
            status,
            memoryRate: getWordMemoryRate(word),
            isPrimary: isPrimaryMeaningWord(word),
          }],
          representative: word,
          memoryRate: getWordMemoryRate(word),
          status,
          isDistinctGroup: false,
        });
      }
      continue;
    }

    const bestWordBySense = new Map<string, T>();
    for (const word of bucketWords) {
      const senseKey = getWordMemorySenseKey(word);
      bestWordBySense.set(senseKey, pickBestSenseWord(bestWordBySense.get(senseKey), word));
    }

    const senses = [...bestWordBySense.entries()].map(([senseKey, word]) => {
      const status = word.status ?? 'new';
      return {
        key: senseKey,
        word,
        japanese: word.japanese,
        status,
        memoryRate: getWordMemoryRate(word),
        isPrimary: isPrimaryMeaningWord(word),
      };
    });
    const memoryRate = Math.round(
      senses.reduce((sum, sense) => sum + sense.memoryRate, 0) / Math.max(1, senses.length),
    );
    const representative = senses.find((sense) => sense.isPrimary)?.word ?? senses[0]?.word ?? bucketWords[0];

    passthrough.push({
      key,
      words: bucketWords,
      senses,
      representative,
      memoryRate,
      status: getMemoryStatusFromRate(memoryRate),
      isDistinctGroup,
    });
  }

  return passthrough;
}

export function summarizeWordMemory(words: readonly WordMemoryInput[]): WordMemorySummary {
  const summary: WordMemorySummary = {
    total: 0,
    mastered: 0,
    learning: 0,
    unlearned: 0,
  };

  for (const group of groupWordsByMemory(words)) {
    summary.total += 1;
    if (group.status === 'mastered') summary.mastered += 1;
    else if (group.status === 'review') summary.learning += 1;
    else summary.unlearned += 1;
  }

  return summary;
}
