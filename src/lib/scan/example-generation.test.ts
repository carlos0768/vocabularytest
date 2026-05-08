import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyClientLocalGeneratedExamples,
  buildClientLocalExampleSeedWords,
} from '@/lib/scan/example-generation';

test('buildClientLocalExampleSeedWords uses index strings as client_local placeholder ids', () => {
  const seedWords = buildClientLocalExampleSeedWords([
    {
      english: 'adapt',
      japanese: '適応する',
    },
    {
      english: 'concise',
      japanese: '簡潔な',
    },
  ]);

  assert.deepEqual(seedWords, [
    {
      id: '0',
      english: 'adapt',
      japanese: '適応する',
    },
    {
      id: '1',
      english: 'concise',
      japanese: '簡潔な',
    },
  ]);
});

test('buildClientLocalExampleSeedWords excludes words that already have examples', () => {
  const seedWords = buildClientLocalExampleSeedWords([
    {
      english: 'persist',
      japanese: '続ける',
      exampleSentence: 'She persisted through the difficult assignment.',
    },
    {
      english: 'resilience',
      japanese: '回復力',
    },
  ]);

  assert.deepEqual(seedWords, [
    {
      id: '0',
      english: 'resilience',
      japanese: '回復力',
    },
  ]);
});

test('applyClientLocalGeneratedExamples applies examples, Japanese, and POS when generated examples exist', () => {
  const words = [
    {
      english: 'adapt',
      japanese: '適応する',
      distractors: [],
    },
  ];

  const applied = applyClientLocalGeneratedExamples(words, [
    {
      wordId: '0',
      exampleSentence: 'We adapt quickly to new rules.',
      exampleSentenceJa: '私たちは新しい規則にすばやく適応します。',
      partOfSpeechTags: ['verb'],
    },
  ]);

  assert.deepEqual(applied, [
    {
      english: 'adapt',
      japanese: '適応する',
      distractors: [],
      exampleSentence: 'We adapt quickly to new rules.',
      exampleSentenceJa: '私たちは新しい規則にすばやく適応します。',
      partOfSpeechTags: ['verb'],
    },
  ]);
  assert.equal(words[0]?.exampleSentence, undefined);
});

test('applyClientLocalGeneratedExamples does not overwrite existing POS with empty generated tags', () => {
  const words = [
    {
      english: 'resilience',
      japanese: '回復力',
      distractors: [],
      partOfSpeechTags: ['noun'],
    },
  ];

  const applied = applyClientLocalGeneratedExamples(words, [
    {
      wordId: '0',
      exampleSentence: 'The team showed resilience after the loss.',
      exampleSentenceJa: 'そのチームは敗北後に回復力を示しました。',
      partOfSpeechTags: [],
    },
  ]);

  assert.deepEqual(applied[0], {
    english: 'resilience',
    japanese: '回復力',
    distractors: [],
    exampleSentence: 'The team showed resilience after the loss.',
    exampleSentenceJa: 'そのチームは敗北後に回復力を示しました。',
    partOfSpeechTags: ['noun'],
  });
});

test('applyClientLocalGeneratedExamples preserves original words without generated results', () => {
  const missingGenerated = {
    english: 'concise',
    japanese: '簡潔な',
    distractors: [],
  };
  const words = [
    {
      english: 'adapt',
      japanese: '適応する',
      distractors: [],
    },
    missingGenerated,
  ];

  const applied = applyClientLocalGeneratedExamples(words, [
    {
      wordId: '0',
      exampleSentence: 'We adapt quickly to new rules.',
      exampleSentenceJa: '私たちは新しい規則にすばやく適応します。',
      partOfSpeechTags: ['verb'],
    },
  ]);

  assert.deepEqual(applied[1], missingGenerated);
  assert.equal(applied[1], missingGenerated);
});
