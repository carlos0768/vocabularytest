import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORD_ORDER_BLANK_TOKEN,
  WORD_ORDER_CACHE_VERSION,
} from '@/lib/quiz/word-order';
import type { WordOrderQuizCache } from '@/types';
import {
  buildWordOrderQuizPrefillSeedWords,
  buildWordOrderQuizUpdatePayload,
  prefillWordOrderQuizzesForWords,
  type WordOrderQuizUpdateClient,
} from './word-order-prefill';

function createCache(overrides: Partial<WordOrderQuizCache> = {}): WordOrderQuizCache {
  return {
    version: WORD_ORDER_CACHE_VERSION,
    sourceEnglish: 'take care',
    sourceJapanese: '世話をする',
    sentenceTokens: [WORD_ORDER_BLANK_TOKEN, WORD_ORDER_BLANK_TOKEN],
    answerTokens: ['take', 'care'],
    decoyTokens: ['hold', 'keep', 'watch'],
    generatedAt: '2026-05-09T00:00:00.000Z',
    ...overrides,
  };
}

test('buildWordOrderQuizPrefillSeedWords selects multi-word entries missing cache only', () => {
  const seedWords = buildWordOrderQuizPrefillSeedWords([
    {
      id: 'single-word',
      english: 'adapt',
      japanese: '適応する',
    },
    {
      id: 'multi-word',
      english: 'take care',
      japanese: '世話をする',
    },
    {
      id: 'cached',
      english: 'take care',
      japanese: '世話をする',
      word_order_quiz: createCache(),
    },
    {
      id: 'blank-ja',
      english: 'look up',
      japanese: '',
    },
  ]);

  assert.deepEqual(seedWords, [
    {
      id: 'multi-word',
      english: 'take care',
      japanese: '世話をする',
    },
  ]);
});

test('buildWordOrderQuizUpdatePayload stores generated cache in DB column shape', () => {
  const quiz = createCache();

  assert.deepEqual(buildWordOrderQuizUpdatePayload(quiz), {
    word_order_quiz: quiz,
  });
});

test('prefillWordOrderQuizzesForWords generates and persists word-order quiz cache', async () => {
  const updates: Array<{ payload: Record<string, unknown>; id: string }> = [];
  const updateClient: WordOrderQuizUpdateClient = {
    from: () => ({
      update: (payload) => ({
        eq: async (_column, value) => {
          updates.push({ payload, id: value });
          return { error: null };
        },
      }),
    }),
  };
  const quiz = createCache();

  const summary = await prefillWordOrderQuizzesForWords(
    [
      {
        id: 'multi-word',
        english: 'take care',
        japanese: '世話をする',
      },
    ],
    {
      getUpdateClient: () => updateClient,
      generate: async (words) => words.map((word) => ({
        wordId: word.id,
        quiz,
      })),
    },
  );

  assert.deepEqual(summary, {
    requested: 1,
    generated: 1,
    persisted: 1,
    failed: 0,
  });
  assert.deepEqual(updates, [
    {
      id: 'multi-word',
      payload: {
        word_order_quiz: quiz,
      },
    },
  ]);
});
