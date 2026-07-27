import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_POLYSEMY_SENSES_PER_WORD,
  buildPolysemyTranslationRows,
  type PolysemySenseInput,
} from './polysemy-senses';

function sense(overrides: Partial<PolysemySenseInput> & Pick<PolysemySenseInput, 'id' | 'translationJa'>): PolysemySenseInput {
  return {
    lexiconEntryId: 'entry-right',
    normalizedTranslationJa: overrides.translationJa,
    distinctKey: overrides.translationJa,
    isPrimary: false,
    ...overrides,
  };
}

const rightSenses: PolysemySenseInput[] = [
  sense({ id: 'sense-right', translationJa: '右', distinctKey: null, isPrimary: true }),
  sense({ id: 'sense-entitlement', translationJa: '権利' }),
  sense({ id: 'sense-correct', translationJa: '正しい' }),
];

test('extra senses become non-primary translation rows, plus a seeded primary row', () => {
  const rows = buildPolysemyTranslationRows({
    words: [{ id: 'word-1', japanese: '右', lexiconEntryId: 'entry-right', lexiconSenseId: 'sense-right' }],
    sensesByEntryId: new Map([['entry-right', rightSenses]]),
    existingTranslations: [],
  });

  assert.equal(rows.length, 3);
  // 非primary行だけ入れるとその語義が単語の表示訳になってしまうので、
  // 単語自身の訳を primary 行として先に作る。
  assert.deepEqual(
    rows.map((row) => [row.translation_ja, row.is_primary, row.position]),
    [['右', true, 0], ['権利', false, 1], ['正しい', false, 2]],
  );
  assert.equal(rows[0].lexicon_sense_id, 'sense-right');
  assert.equal(rows[1].lexicon_sense_id, 'sense-entitlement');
  assert.equal(rows[1].source, 'ai');
  assert.deepEqual(rows.map((row) => row.meaning_rank), [1, 2, 3]);
});

test('existing translations are kept and appended after, never duplicated', () => {
  const rows = buildPolysemyTranslationRows({
    words: [{ id: 'word-1', japanese: '右', lexiconEntryId: 'entry-right' }],
    sensesByEntryId: new Map([['entry-right', rightSenses]]),
    existingTranslations: [
      { wordId: 'word-1', translationJa: '右', normalizedTranslationJa: '右', position: 0, isPrimary: true },
      { wordId: 'word-1', translationJa: '権利', normalizedTranslationJa: '権利', position: 1, isPrimary: false },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.translation_ja, row.position]),
    [['正しい', 2]],
  );
});

test('the primary sense is never added as an extra target', () => {
  const rows = buildPolysemyTranslationRows({
    words: [{ id: 'word-1', japanese: '右', lexiconEntryId: 'entry-right' }],
    sensesByEntryId: new Map([['entry-right', [rightSenses[0]]]]),
    existingTranslations: [],
  });

  assert.deepEqual(rows, []);
});

test('senses without a distinct key are not quizzable and stay out', () => {
  const rows = buildPolysemyTranslationRows({
    words: [{ id: 'word-1', japanese: '右', lexiconEntryId: 'entry-right' }],
    sensesByEntryId: new Map([[
      'entry-right',
      [sense({ id: 'sense-x', translationJa: '権利', distinctKey: null })],
    ]]),
    existingTranslations: [],
  });

  assert.deepEqual(rows, []);
});

test('words without a lexicon entry or without extra senses produce nothing', () => {
  assert.deepEqual(
    buildPolysemyTranslationRows({
      words: [{ id: 'word-1', japanese: '右', lexiconEntryId: null }],
      sensesByEntryId: new Map([['entry-right', rightSenses]]),
      existingTranslations: [],
    }),
    [],
  );

  assert.deepEqual(
    buildPolysemyTranslationRows({
      words: [{ id: 'word-1', japanese: '右', lexiconEntryId: 'entry-unknown' }],
      sensesByEntryId: new Map([['entry-right', rightSenses]]),
      existingTranslations: [],
    }),
    [],
  );
});

test('extra senses per word are capped', () => {
  const many = Array.from({ length: 8 }, (_, index) => sense({
    id: `sense-${index}`,
    translationJa: `意味${index}`,
  }));

  const rows = buildPolysemyTranslationRows({
    words: [{ id: 'word-1', japanese: '主要な意味', lexiconEntryId: 'entry-right' }],
    sensesByEntryId: new Map([['entry-right', many]]),
    existingTranslations: [],
  });

  assert.equal(rows.filter((row) => !row.is_primary).length, MAX_POLYSEMY_SENSES_PER_WORD);
  assert.equal(
    buildPolysemyTranslationRows({
      words: [{ id: 'word-1', japanese: '主要な意味', lexiconEntryId: 'entry-right' }],
      sensesByEntryId: new Map([['entry-right', many]]),
      existingTranslations: [],
      maxSensesPerWord: 1,
    }).filter((row) => !row.is_primary).length,
    1,
  );
});

test('a sense identical to the word own meaning is skipped', () => {
  const rows = buildPolysemyTranslationRows({
    words: [{ id: 'word-1', japanese: '権利', lexiconEntryId: 'entry-right' }],
    sensesByEntryId: new Map([['entry-right', rightSenses]]),
    existingTranslations: [],
  });

  assert.deepEqual(
    rows.map((row) => row.translation_ja),
    ['権利', '正しい'],
  );
});
