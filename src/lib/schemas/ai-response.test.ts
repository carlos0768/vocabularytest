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

test('parseAIResponse splits semicolon-delimited Japanese meanings into translations', () => {
  const result = parseAIResponse({
    words: [
      {
        english: 'sense',
        japanese: '感覚;分別',
        japaneseSource: 'scan',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    sourceLabels: [],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.words[0]?.japanese, '感覚');
  assert.deepEqual(
    result.data?.words[0]?.translations?.map((translation) => ({
      text: translation.translationJa,
      rank: translation.meaningRank,
      primary: translation.isPrimary,
    })),
    [
      { text: '感覚', rank: 1, primary: true },
      { text: '分別', rank: 2, primary: false },
    ],
  );
});

test('parseAIResponse moves annotation ranges into the translation notes custom section', () => {
  const result = parseAIResponse({
    words: [
      {
        english: 'admire',
        japanese: 'に(~のことで)敬服 [感心] する',
        japaneseSource: 'scan',
        translations: [
          {
            japanese: 'に(~のことで)敬服 [感心] する',
            source: 'scan',
            meaningRank: 1,
            annotationRanges: ['に(~のことで)', '[感心]'],
          },
        ],
        distractors: [],
        partOfSpeechTags: ['verb'],
      },
    ],
    sourceLabels: [],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.words[0]?.japanese, '敬服する');
  assert.deepEqual(result.data?.words[0]?.translations?.map((translation) => translation.translationJa), ['敬服する']);
  assert.deepEqual(result.data?.words[0]?.customSections, [
    {
      id: 'translation-notes',
      title: '訳注',
      content: 'に(~のことで)\n[感心]',
    },
  ]);
});

// --- コンパクト出力形式（プロンプトのトークン削減で採用した形）のテスト ---

test('parseAIResponse synthesizes translations when the AI omits the translations array', () => {
  const result = parseAIResponse({
    words: [
      {
        english: 'accomplish',
        japanese: '達成する',
        japaneseSource: 'scan',
        partOfSpeechTags: ['verb'],
      },
    ],
    sourceLabels: [],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.words[0]?.japanese, '達成する');
  assert.deepEqual(
    result.data?.words[0]?.translations?.map((translation) => ({
      text: translation.translationJa,
      source: translation.source,
      rank: translation.meaningRank,
      primary: translation.isPrimary,
    })),
    [{ text: '達成する', source: 'scan', rank: 1, primary: true }],
  );
});

test('parseAIResponse accepts translations as a plain string array with inherited source', () => {
  const result = parseAIResponse({
    words: [
      {
        english: 'sense',
        japanese: '感覚',
        japaneseSource: 'scan',
        translations: ['感覚', '分別'],
        partOfSpeechTags: ['noun'],
      },
    ],
    sourceLabels: [],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.words[0]?.japanese, '感覚');
  assert.deepEqual(
    result.data?.words[0]?.translations?.map((translation) => ({
      text: translation.translationJa,
      source: translation.source,
      rank: translation.meaningRank,
    })),
    [
      { text: '感覚', source: 'scan', rank: 1 },
      { text: '分別', source: 'scan', rank: 2 },
    ],
  );
});

test('parseAIResponse accepts mixed string/object translations without source or meaningRank', () => {
  const result = parseAIResponse({
    words: [
      {
        english: 'admire',
        japanese: '敬服する',
        japaneseSource: 'scan',
        translations: [
          { japanese: 'に(~のことで)敬服する', annotationRanges: ['に(~のことで)'] },
          '感心する',
        ],
        partOfSpeechTags: ['verb'],
      },
    ],
    sourceLabels: [],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.words[0]?.japanese, '敬服する');
  assert.deepEqual(
    result.data?.words[0]?.translations?.map((translation) => ({
      text: translation.translationJa,
      source: translation.source,
      rank: translation.meaningRank,
    })),
    [
      { text: '敬服する', source: 'scan', rank: 1 },
      { text: '感心する', source: 'scan', rank: 2 },
    ],
  );
  assert.deepEqual(result.data?.words[0]?.customSections, [
    {
      id: 'translation-notes',
      title: '訳注',
      content: 'に(~のことで)',
    },
  ]);
});
