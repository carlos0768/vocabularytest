import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyClientLocalGeneratedClassicalExamples,
  applyClientLocalGeneratedExamples,
  buildClientLocalClassicalExampleSeedWords,
  buildClientLocalExampleSeedWords,
  buildServerCloudClassicalExampleSeedWords,
  buildServerCloudExampleSeedWords,
  buildServerCloudExampleUpdatePayload,
  type ClientLocalExampleWord,
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
  const words: Array<ClientLocalExampleWord & { distractors: string[] }> = [
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

// ---------- 古典語との混在 ----------

// シードは古典語を飛ばすのに apply が飛ばさないと、以降の英単語が1つずつ
// ズレて「別の単語の例文」が付く。両者が同じ述語を使うことを固定する。
test('applyClientLocalGeneratedExamples stays aligned when classical words are mixed in', () => {
  const words: ClientLocalExampleWord[] = [
    { english: 'あさまし', japanese: '驚きあきれる', classicalEntryId: 'entry-1' },
    { english: 'adapt', japanese: '適応する' },
    { english: 'concise', japanese: '簡潔な' },
  ];

  const seedWords = buildClientLocalExampleSeedWords(words);
  assert.deepEqual(seedWords, [
    { id: '0', english: 'adapt', japanese: '適応する' },
    { id: '1', english: 'concise', japanese: '簡潔な' },
  ]);

  const applied = applyClientLocalGeneratedExamples(words, [
    {
      wordId: '0',
      exampleSentence: 'We adapt quickly.',
      exampleSentenceJa: '私たちはすばやく適応します。',
      partOfSpeechTags: ['verb'],
    },
    {
      wordId: '1',
      exampleSentence: 'Keep it concise.',
      exampleSentenceJa: '簡潔にしてください。',
      partOfSpeechTags: ['adjective'],
    },
  ]);

  // 古典語には英語例文を付けない
  assert.equal(applied[0]?.exampleSentence, undefined);
  assert.equal(applied[1]?.exampleSentence, 'We adapt quickly.');
  assert.equal(applied[2]?.exampleSentence, 'Keep it concise.');
});

test('buildClientLocalClassicalExampleSeedWords picks only classical words without examples', () => {
  const seedWords = buildClientLocalClassicalExampleSeedWords([
    { english: 'adapt', japanese: '適応する' },
    { english: 'あさまし', japanese: '驚きあきれる', classicalEntryId: 'entry-1', reading: 'あさまし' },
    { english: 'をかし', japanese: '趣がある', classicalEntryId: 'entry-2', exampleSentence: 'いとをかし。' },
    { english: 'ゆかし', japanese: '心ひかれる', isClassical: true },
  ]);

  assert.deepEqual(seedWords, [
    { id: '0', headword: 'あさまし', meaning: '驚きあきれる', reading: 'あさまし' },
    { id: '1', headword: 'ゆかし', meaning: '心ひかれる' },
  ]);
});

test('applyClientLocalGeneratedClassicalExamples applies to classical words only', () => {
  const words: ClientLocalExampleWord[] = [
    { english: 'adapt', japanese: '適応する' },
    { english: 'あさまし', japanese: '驚きあきれる', classicalEntryId: 'entry-1' },
  ];

  const applied = applyClientLocalGeneratedClassicalExamples(words, [
    { wordId: '0', exampleSentence: 'あさましき事なり。', exampleSentenceJa: '驚きあきれることだ。' },
  ]);

  assert.equal(applied[0]?.exampleSentence, undefined);
  assert.equal(applied[1]?.exampleSentence, 'あさましき事なり。');
  assert.equal(applied[1]?.exampleSentenceJa, '驚きあきれることだ。');
  // 品詞タグは触らない（英語の品詞体系は古典語に当たらない）
  assert.equal(applied[1]?.partOfSpeechTags, undefined);
});

test('buildServerCloudClassicalExampleSeedWords excludes English and already-filled words', () => {
  const seedWords = buildServerCloudClassicalExampleSeedWords([
    { id: 'w1', english: 'adapt', japanese: '適応する', example_sentence: null },
    { id: 'w2', english: 'あさまし', japanese: '驚きあきれる', classical_entry_id: 'entry-1', example_sentence: null },
    { id: 'w3', english: 'をかし', japanese: '趣がある', classical_entry_id: 'entry-2', example_sentence: '  ' },
    { id: 'w4', english: 'ゆかし', japanese: '心ひかれる', classical_entry_id: 'entry-3', example_sentence: 'ゆかしき人。' },
  ]);

  assert.deepEqual(seedWords, [
    { id: 'w2', headword: 'あさまし', meaning: '驚きあきれる' },
    { id: 'w3', headword: 'をかし', meaning: '趣がある' },
  ]);
});
