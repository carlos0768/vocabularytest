import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAIResponse } from './ai-response';

test('parseAIResponse accepts japaneseSource=ai', () => {
  const result = parseAIResponse({
    words: [
      {
        english: 'experiment',
        japanese: '実験',
        japaneseSource: 'ai',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    sourceLabels: ['鉄壁'],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.words[0]?.japaneseSource, 'ai');
});

test('parseAIResponse remains backward-compatible when japaneseSource is absent', () => {
  const result = parseAIResponse({
    words: [
      {
        english: 'beeline',
        japanese: '一直線',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    sourceLabels: [],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.words[0]?.japaneseSource, undefined);
});

test('parseAIResponse clears japaneseSource when japanese is blank or invalid', () => {
  const result = parseAIResponse({
    words: [
      {
        english: 'viral',
        japanese: '-',
        japaneseSource: 'ai',
        distractors: [],
        partOfSpeechTags: ['adjective'],
      },
    ],
    sourceLabels: [],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.words[0]?.japanese, '');
  assert.equal(result.data?.words[0]?.japaneseSource, undefined);
});

test('parseAIResponse ignores invalid japaneseSource values without failing', () => {
  const result = parseAIResponse({
    words: [
      {
        english: 'springboard',
        japanese: '出発点',
        japaneseSource: 'model',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    sourceLabels: [],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.words[0]?.japaneseSource, undefined);
});
