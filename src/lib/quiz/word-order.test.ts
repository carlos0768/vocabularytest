import test from 'node:test';
import assert from 'node:assert/strict';

import type { Word, WordOrderQuizCache } from '@/types';
import {
  WORD_ORDER_BLANK_TOKEN,
  WORD_ORDER_CACHE_VERSION,
  buildWordOrderQuestion,
  isWordOrderEligible,
  normalizeWordOrderQuizCache,
  splitEnglishPhraseTokens,
} from './word-order';

const identityShuffle = <T>(items: T[]): T[] => [...items];

function createWord(overrides: Partial<Word> & Pick<Word, 'id' | 'english' | 'japanese'>): Word {
  return {
    projectId: 'project-1',
    distractors: [],
    status: 'new',
    createdAt: '2026-01-01T00:00:00.000Z',
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    ...overrides,
  };
}

function createCache(overrides: Partial<WordOrderQuizCache> = {}): WordOrderQuizCache {
  return {
    version: WORD_ORDER_CACHE_VERSION,
    sourceEnglish: 'take care of',
    sourceJapanese: '世話をする',
    sentenceTokens: [WORD_ORDER_BLANK_TOKEN, WORD_ORDER_BLANK_TOKEN, 'of'],
    answerTokens: ['take', 'care'],
    decoyTokens: ['hold', 'keep', 'watch'],
    generatedAt: '2026-05-09T00:00:00.000Z',
    ...overrides,
  };
}

test('splitEnglishPhraseTokens and isWordOrderEligible target multi-word English only', () => {
  assert.deepEqual(splitEnglishPhraseTokens('  take   care  '), ['take', 'care']);
  assert.equal(isWordOrderEligible(createWord({ id: 'word-1', english: 'take care', japanese: '世話をする' })), true);
  assert.equal(isWordOrderEligible(createWord({ id: 'word-2', english: 'apple', japanese: 'りんご' })), false);
});

test('normalizeWordOrderQuizCache accepts a valid cache tied to the current word text', () => {
  const word = createWord({ id: 'word-1', english: 'take care of', japanese: '世話をする' });

  const normalized = normalizeWordOrderQuizCache(word, createCache());

  assert.deepEqual(normalized?.sentenceTokens, [WORD_ORDER_BLANK_TOKEN, WORD_ORDER_BLANK_TOKEN, 'of']);
  assert.deepEqual(normalized?.answerTokens, ['take', 'care']);
  assert.deepEqual(normalized?.decoyTokens, ['hold', 'keep', 'watch']);
});

test('normalizeWordOrderQuizCache rejects stale source text and invalid token layout', () => {
  const word = createWord({ id: 'word-1', english: 'take care of', japanese: '世話をする' });

  assert.equal(
    normalizeWordOrderQuizCache(word, createCache({ sourceEnglish: 'look after' })),
    null,
  );
  assert.equal(
    normalizeWordOrderQuizCache(word, createCache({ answerTokens: ['take', 'care', 'of', 'now'] })),
    null,
  );
  assert.equal(
    normalizeWordOrderQuizCache(word, createCache({ sentenceTokens: [WORD_ORDER_BLANK_TOKEN, 'care', 'of'] })),
    null,
  );
  assert.equal(
    normalizeWordOrderQuizCache(word, createCache({ decoyTokens: ['take', 'keep', 'watch'] })),
    null,
  );
});

test('buildWordOrderQuestion turns a valid cache into a chip-based quiz question', () => {
  const word = createWord({
    id: 'word-1',
    english: 'take care of',
    japanese: '世話をする',
    wordOrderQuiz: createCache(),
  });

  const question = buildWordOrderQuestion(word, identityShuffle);

  assert.equal(question?.type, 'word-order');
  assert.deepEqual(question?.answerTokens, ['take', 'care']);
  assert.deepEqual(question?.options, ['take', 'care', 'hold', 'keep', 'watch']);
});
