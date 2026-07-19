import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManualEnrichPrompt,
  pickManualMasterEnrichment,
  type ManualEnrichmentMasterRow,
} from '@/lib/words/manual-enrichment';

function row(overrides: Partial<ManualEnrichmentMasterRow> = {}): ManualEnrichmentMasterRow {
  return {
    id: 'entry-1',
    pos: 'verb',
    translation_ja: '走る',
    example_sentence: 'I run every day.',
    example_sentence_ja: '私は毎日走る。',
    pronunciation: '/rʌn/',
    ...overrides,
  };
}

test('pickManualMasterEnrichment returns null when the master has no rows', () => {
  assert.equal(pickManualMasterEnrichment([], '走る'), null);
});

test('pickManualMasterEnrichment prefers the row matching the user translation', () => {
  const result = pickManualMasterEnrichment(
    [
      row({ id: 'entry-noun', pos: 'noun', translation_ja: '経営', example_sentence: 'He is in charge of the run.', example_sentence_ja: '彼が運営を担当している。' }),
      row({ id: 'entry-verb', pos: 'verb', translation_ja: '走る' }),
    ],
    '走る',
  );

  assert.ok(result);
  assert.equal(result.entryId, 'entry-verb');
  assert.deepEqual(result.partOfSpeechTags, ['verb']);
  assert.equal(result.exampleSentence, 'I run every day.');
  assert.equal(result.exampleSentenceJa, '私は毎日走る。');
});

test('pickManualMasterEnrichment takes pronunciation from any row when the best row lacks it', () => {
  const result = pickManualMasterEnrichment(
    [
      row({ id: 'entry-a', translation_ja: '走る', pronunciation: null }),
      row({ id: 'entry-b', pos: 'noun', translation_ja: '経営', pronunciation: '/rʌn/', example_sentence: null, example_sentence_ja: null }),
    ],
    '走る',
  );

  assert.ok(result);
  assert.equal(result.entryId, 'entry-a');
  assert.equal(result.pronunciation, '/rʌn/');
});

test('pickManualMasterEnrichment drops examples when the Japanese half is missing', () => {
  const result = pickManualMasterEnrichment(
    [row({ example_sentence_ja: null })],
    '走る',
  );

  assert.ok(result);
  assert.equal(result.exampleSentence, '');
  assert.equal(result.exampleSentenceJa, '');
});

test('pickManualMasterEnrichment falls back to the most complete row without a hint match', () => {
  const result = pickManualMasterEnrichment(
    [
      row({ id: 'sparse', pos: null, translation_ja: '別訳', example_sentence: null, example_sentence_ja: null, pronunciation: null }),
      row({ id: 'complete', translation_ja: '別訳2' }),
    ],
    '一致しない訳',
  );

  assert.ok(result);
  assert.equal(result.entryId, 'complete');
});

test('pickManualMasterEnrichment supplies a Japanese translation for empty manual input', () => {
  const result = pickManualMasterEnrichment(
    [
      row({ id: 'entry-a', translation_ja: null, pronunciation: null }),
      row({ id: 'entry-b', pos: 'noun', translation_ja: '経営', example_sentence: null, example_sentence_ja: null }),
    ],
    '',
  );

  assert.ok(result);
  assert.equal(result.japanese, '経営');
});

test('buildManualEnrichPrompt lists only the fields the AI must generate', () => {
  const prompt = buildManualEnrichPrompt('run', '走る', {
    pronunciation: false,
    pos: true,
    example: true,
  });

  assert.equal(prompt.includes('japanese'), false);
  assert.equal(prompt.includes('pronunciation'), false);
  assert.equal(prompt.includes('partOfSpeechTags'), true);
  assert.equal(prompt.includes('exampleSentence, exampleSentenceJa'), true);
  assert.equal(prompt.includes('"run" (走る)'), true);
});

test('buildManualEnrichPrompt asks for a Japanese translation when the user left it blank', () => {
  const prompt = buildManualEnrichPrompt('run', '', {
    japanese: true,
    pronunciation: true,
    pos: false,
    example: false,
  });

  assert.equal(prompt.includes('japanese'), true);
  assert.equal(prompt.includes('"run"\n'), true);
});
