import type { Word, WordOrderQuizCache, WordOrderQuizQuestion } from '@/types';
import { shuffleArray } from '@/lib/utils';

export const WORD_ORDER_BLANK_TOKEN = '___';
export const WORD_ORDER_CACHE_VERSION = 1;
export const WORD_ORDER_MAX_ANSWER_TOKENS = 30;
export const WORD_ORDER_DECOY_COUNT = 3;

type ShuffleFn = <T>(items: T[]) => T[];

function compactText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function key(value: string): string {
  return compactText(value).toLowerCase();
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const token = compactText(value);
  return token.length > 0 && token.length <= maxLength ? token : null;
}

function normalizeToken(value: unknown): string | null {
  return normalizeText(value, 80);
}

function normalizeTokenArray(
  value: unknown,
  max: number,
  options: { allowDuplicates?: boolean } = {},
): string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const token = normalizeToken(item);
    if (!token) return null;
    const tokenKey = key(token);
    if (!options.allowDuplicates && seen.has(tokenKey)) return null;
    seen.add(tokenKey);
    result.push(token);
    if (result.length > max) return null;
  }

  return result;
}

export function splitEnglishPhraseTokens(english: string): string[] {
  return compactText(english)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function isWordOrderEligible(word: Pick<Word, 'english'>): boolean {
  return splitEnglishPhraseTokens(word.english).length >= 2;
}

export function normalizeWordOrderQuizCache(
  word: Pick<Word, 'english' | 'japanese'>,
  value: unknown,
  now = new Date().toISOString(),
): WordOrderQuizCache | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.version !== WORD_ORDER_CACHE_VERSION) return null;

  const sourceEnglish = normalizeText(record.sourceEnglish, 200);
  const sourceJapanese = normalizeText(record.sourceJapanese, 300);
  const rawSentenceTokens = normalizeTokenArray(record.sentenceTokens, 30, { allowDuplicates: true });
  const rawAnswerTokens = normalizeTokenArray(record.answerTokens, WORD_ORDER_MAX_ANSWER_TOKENS, { allowDuplicates: true });
  const decoyTokens = normalizeTokenArray(record.decoyTokens, WORD_ORDER_DECOY_COUNT);
  const generatedAt = typeof record.generatedAt === 'string' && record.generatedAt.trim()
    ? record.generatedAt
    : now;

  if (!sourceEnglish || !sourceJapanese || !rawSentenceTokens || !rawAnswerTokens || !decoyTokens) {
    return null;
  }
  if (key(sourceEnglish) !== key(word.english) || key(sourceJapanese) !== key(word.japanese)) {
    return null;
  }
  const answerTokens = normalizeTokenArray(
    splitEnglishPhraseTokens(sourceEnglish),
    WORD_ORDER_MAX_ANSWER_TOKENS,
    { allowDuplicates: true },
  );
  if (!answerTokens || answerTokens.length < 2) {
    return null;
  }
  if (decoyTokens.length !== WORD_ORDER_DECOY_COUNT) {
    return null;
  }
  if (rawAnswerTokens.length < 1) {
    return null;
  }

  const sourceTokenKeys = new Set(splitEnglishPhraseTokens(word.english).map(key));
  if (!rawAnswerTokens.every((token) => sourceTokenKeys.has(key(token)))) {
    return null;
  }
  if (rawSentenceTokens.filter((token) => token === WORD_ORDER_BLANK_TOKEN).length !== rawAnswerTokens.length) {
    return null;
  }
  if (!rawSentenceTokens.every((token) => token === WORD_ORDER_BLANK_TOKEN || sourceTokenKeys.has(key(token)))) {
    return null;
  }

  const decoyKeys = new Set(decoyTokens.map(key));
  if ([...decoyKeys].some((tokenKey) => sourceTokenKeys.has(tokenKey))) {
    return null;
  }

  return {
    version: WORD_ORDER_CACHE_VERSION,
    sourceEnglish,
    sourceJapanese,
    sentenceTokens: answerTokens.map(() => WORD_ORDER_BLANK_TOKEN),
    answerTokens,
    decoyTokens,
    generatedAt,
  };
}

export function buildWordOrderQuestion(
  word: Word,
  shuffle: ShuffleFn = shuffleArray,
): WordOrderQuizQuestion | null {
  if (!isWordOrderEligible(word)) return null;
  const cache = normalizeWordOrderQuizCache(word, word.wordOrderQuiz);
  if (!cache) return null;
  return {
    type: 'word-order',
    word,
    sentenceTokens: cache.sentenceTokens,
    answerTokens: cache.answerTokens,
    decoyTokens: cache.decoyTokens,
    options: shuffle([...cache.answerTokens, ...cache.decoyTokens]),
  };
}

export function isMultipleChoiceQuestion(question: { type?: string }): boolean {
  return question.type === undefined || question.type === 'multiple-choice';
}
