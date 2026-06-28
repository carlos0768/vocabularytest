import type { WordStatus } from '@/types';

export interface WordMemoryInput {
  id?: string;
  projectId?: string;
  english: string;
  japanese: string;
  status?: WordStatus;
  translations?: Array<{
    translationJa: string;
    normalizedTranslationJa?: string;
    distinctKey?: string;
    lexiconSenseId?: string;
    lexiconSenseIsPrimary?: boolean;
    isPrimary?: boolean;
    status?: WordStatus;
  }>;
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
  active: number;
  learning: number;
  unlearned: number;
}

const STATUS_MEMORY_RATE: Record<WordStatus, number> = {
  new: 0,
  review: 33,
  active: 66,
  mastered: 100,
};

const STATUS_RANK: Record<WordStatus, number> = {
  new: 0,
  review: 1,
  active: 2,
  mastered: 3,
};

function normalizeKeyPart(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getWordMemoryRate(word: Pick<WordMemoryInput, 'status'>): number {
  return STATUS_MEMORY_RATE[word.status ?? 'new'];
}

export function getMemoryStatusFromRate(rate: number): WordStatus {
  if (rate >= 100) return 'mastered';
  if (rate >= 66) return 'active';
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

function getTranslationMemorySenseKey(
  translation: NonNullable<WordMemoryInput['translations']>[number],
): string {
  const distinctKey = normalizeKeyPart(translation.distinctKey);
  if (distinctKey) return `distinct:${distinctKey}`;
  if (translation.lexiconSenseIsPrimary) return 'primary';
  if (translation.lexiconSenseId) return `sense:${translation.lexiconSenseId}`;
  return `ja:${normalizeKeyPart(translation.normalizedTranslationJa || translation.translationJa)}`;
}

function isPrimaryTranslation(
  translation: NonNullable<WordMemoryInput['translations']>[number],
): boolean {
  if (translation.lexiconSenseIsPrimary === true) return true;
  if (translation.lexiconSenseIsPrimary === false) return false;
  return Boolean(translation.isPrimary) && !normalizeKeyPart(translation.distinctKey);
}

function getWordMemorySenses<T extends WordMemoryInput>(word: T): WordMemorySense<T>[] {
  const senses: WordMemorySense<T>[] = [{
    key: getWordMemorySenseKey(word),
    word,
    japanese: word.japanese,
    status: word.status ?? 'new',
    memoryRate: getWordMemoryRate(word),
    isPrimary: isPrimaryMeaningWord(word),
  }];
  const seen = new Set(senses.map((sense) => sense.key));

  for (const translation of word.translations ?? []) {
    const distinctKey = normalizeKeyPart(translation.distinctKey);
    if (!distinctKey) continue;
    const key = getTranslationMemorySenseKey(translation);
    if (seen.has(key)) continue;
    seen.add(key);
    const status = translation.status ?? 'new';
    senses.push({
      key,
      word,
      japanese: translation.translationJa,
      status,
      memoryRate: getWordMemoryRate({ status }),
      isPrimary: isPrimaryTranslation(translation),
    });
  }

  return senses;
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
      typeof word.lexiconSenseIsPrimary === 'boolean' ||
      (word.translations ?? []).some((translation) => normalizeKeyPart(translation.distinctKey).length > 0)
    );
    const bucketSenses = bucketWords.flatMap(getWordMemorySenses);
    const uniqueSenseKeys = new Set(bucketSenses.map((sense) => sense.key));
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

    const bestSenseByKey = new Map<string, WordMemorySense<T>>();
    for (const sense of bucketSenses) {
      const current = bestSenseByKey.get(sense.key);
      if (!current) {
        bestSenseByKey.set(sense.key, sense);
        continue;
      }
      const pickedWord = pickBestSenseWord(current.word, sense.word);
      const currentRank = STATUS_RANK[current.status];
      const incomingRank = STATUS_RANK[sense.status];
      bestSenseByKey.set(
        sense.key,
        incomingRank > currentRank || pickedWord === sense.word ? sense : current,
      );
    }

    const senses = [...bestSenseByKey.values()];
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
    active: 0,
    learning: 0,
    unlearned: 0,
  };

  for (const group of groupWordsByMemory(words)) {
    summary.total += 1;
    if (group.status === 'mastered') summary.mastered += 1;
    else if (group.status === 'active') summary.active += 1;
    else if (group.status === 'review') summary.learning += 1;
    else summary.unlearned += 1;
  }

  return summary;
}
