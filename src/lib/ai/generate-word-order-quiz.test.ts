import test from 'node:test';
import assert from 'node:assert/strict';

import { WORD_ORDER_BLANK_TOKEN } from '@/lib/quiz/word-order';
import {
  buildWordOrderPrompt,
  normalizeGeneratedWordOrderResult,
} from './generate-word-order-quiz';

const word = {
  id: 'word-1',
  english: 'take care of',
  japanese: '世話をする',
};

test('buildWordOrderPrompt fixes the Japanese-meaning decoy rule', () => {
  const prompt = buildWordOrderPrompt([word]);

  assert.match(prompt, /日本語訳から連想されやすい雰囲気/);
  assert.match(prompt, /元の english に含まれる語や answerTokens と重複させない/);
  assert.match(prompt, /ID: word-1 \/ English: take care of \/ Japanese: 世話をする/);
});

test('normalizeGeneratedWordOrderResult accepts valid AI output and attaches cache metadata', () => {
  const result = normalizeGeneratedWordOrderResult(
    word,
    {
      sentenceTokens: [WORD_ORDER_BLANK_TOKEN, WORD_ORDER_BLANK_TOKEN, 'of'],
      answerTokens: ['take', 'care'],
      decoyTokens: ['hold', 'keep', 'watch'],
    },
    '2026-05-09T00:00:00.000Z',
  );

  assert.equal(result?.wordId, 'word-1');
  assert.equal(result?.quiz.sourceEnglish, 'take care of');
  assert.equal(result?.quiz.sourceJapanese, '世話をする');
  assert.equal(result?.quiz.generatedAt, '2026-05-09T00:00:00.000Z');
});

test('normalizeGeneratedWordOrderResult rejects decoys that overlap source English tokens', () => {
  const result = normalizeGeneratedWordOrderResult(
    word,
    {
      sentenceTokens: [WORD_ORDER_BLANK_TOKEN, WORD_ORDER_BLANK_TOKEN, 'of'],
      answerTokens: ['take', 'care'],
      decoyTokens: ['take', 'keep', 'watch'],
    },
  );

  assert.equal(result, null);
});
