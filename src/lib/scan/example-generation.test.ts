import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyClientLocalGeneratedExamples,
  buildClientLocalExampleSeedWords,
  buildServerCloudExampleSeedWords,
  buildServerCloudExampleUpdatePayload,
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

test('buildServerCloudExampleSeedWords includes only inserted words with empty or null examples', () => {
  const seedWords = buildServerCloudExampleSeedWords([
    {
      id: 'word-existing',
      english: 'persist',
      japanese: '続ける',
      example_sentence: 'She persisted through the difficult assignment.',
    },
    {
      id: 'word-empty',
      english: 'adapt',
      japanese: '適応する',
      example_sentence: '',
    },
    {
      id: 'word-null',
      english: 'resilience',
      japanese: '回復力',
      example_sentence: null,
    },
  ]);

  assert.deepEqual(seedWords, [
    {
      id: 'word-empty',
      english: 'adapt',
      japanese: '適応する',
    },
    {
      id: 'word-null',
      english: 'resilience',
      japanese: '回復力',
    },
  ]);
});

test('buildServerCloudExampleSeedWords treats whitespace-only examples as missing', () => {
  const seedWords = buildServerCloudExampleSeedWords([
    {
      id: 'inserted-word-id',
      english: 'concise',
      japanese: '簡潔な',
      example_sentence: '   ',
    },
  ]);

  assert.deepEqual(seedWords, [
    {
      id: 'inserted-word-id',
      english: 'concise',
      japanese: '簡潔な',
    },
  ]);
});

test('buildServerCloudExampleSeedWords uses inserted word ids as seed ids', () => {
  const seedWords = buildServerCloudExampleSeedWords([
    {
      id: 'inserted-db-id-123',
      english: 'analyze',
      japanese: '分析する',
      example_sentence: null,
    },
  ]);

  assert.equal(seedWords[0]?.id, 'inserted-db-id-123');
});

test('buildServerCloudExampleUpdatePayload preserves generated example DB update fields', () => {
  const payload = buildServerCloudExampleUpdatePayload({
    wordId: 'word-1',
    exampleSentence: 'Students analyze the chart carefully.',
    exampleSentenceJa: '生徒たちはその図表を注意深く分析します。',
    partOfSpeechTags: ['verb'],
  });

  assert.deepEqual(payload, {
    example_sentence: 'Students analyze the chart carefully.',
    example_sentence_ja: '生徒たちはその図表を注意深く分析します。',
    part_of_speech_tags: ['verb'],
  });
});
