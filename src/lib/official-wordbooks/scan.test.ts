import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendScannedWords,
  applyScanEnrichment,
  buildScanEnrichmentInputs,
  describeScanGaps,
  normalizeScannedWords,
  officialWordbookScanRequestSchema,
  toOfficialWordbookScanWord,
} from './scan';
import { MAX_OFFICIAL_WORDBOOK_WORDS, type OfficialWordbookWordInput } from './editor';

function word(overrides: Partial<OfficialWordbookWordInput> = {}): OfficialWordbookWordInput {
  return {
    english: 'abandon',
    japanese: '見捨てる',
    distractors: [],
    exampleSentence: '',
    exampleSentenceJa: '',
    pronunciation: '',
    partOfSpeechTags: [],
    vocabularyType: null,
    ...overrides,
  };
}

test('toOfficialWordbookScanWord maps an AI word onto an editor row', () => {
  const mapped = toOfficialWordbookScanWord({
    english: '  abandon ',
    japanese: '見捨てる',
    distractors: ['受け入れる', '', '支持する'],
    exampleSentence: 'He abandoned the car.',
    exampleSentenceJa: '彼は車を捨てた。',
    partOfSpeechTags: ['動詞'],
  });

  assert.deepEqual(mapped, {
    english: 'abandon',
    japanese: '見捨てる',
    distractors: ['受け入れる', '支持する'],
    exampleSentence: 'He abandoned the car.',
    exampleSentenceJa: '彼は車を捨てた。',
    pronunciation: '',
    partOfSpeechTags: ['動詞'],
    vocabularyType: null,
  });
});

test('toOfficialWordbookScanWord truncates over-long values instead of dropping the word', () => {
  const mapped = toOfficialWordbookScanWord({
    english: 'a'.repeat(500),
    japanese: 'あ'.repeat(900),
    exampleSentence: 'x'.repeat(2000),
  });

  assert.ok(mapped);
  assert.equal(mapped.english.length, 200);
  assert.equal(mapped.japanese?.length, 500);
  assert.equal(mapped.exampleSentence?.length, 1000);
});

test('toOfficialWordbookScanWord drops rows without a usable english term', () => {
  assert.equal(toOfficialWordbookScanWord({ english: '', japanese: 'なし' }), null);
  assert.equal(toOfficialWordbookScanWord({ english: '---', japanese: 'なし' }), null);
  assert.equal(toOfficialWordbookScanWord(null), null);
  assert.equal(toOfficialWordbookScanWord('abandon'), null);
});

test('normalizeScannedWords drops duplicates inside one image case-insensitively', () => {
  const result = normalizeScannedWords([
    { english: 'Abandon', japanese: '見捨てる' },
    { english: 'abandon', japanese: '放棄する' },
    { english: '', japanese: '空' },
    { english: 'brief', japanese: '簡潔な' },
  ]);

  assert.deepEqual(result.words.map((item) => item.english), ['Abandon', 'brief']);
  assert.equal(result.dropped, 2);
});

test('normalizeScannedWords tolerates a non-array payload', () => {
  assert.deepEqual(normalizeScannedWords(undefined), { words: [], dropped: 0 });
});

test('appendScannedWords keeps existing rows and skips duplicates', () => {
  const result = appendScannedWords(
    [word({ english: 'abandon' })],
    [word({ english: 'ABANDON' }), word({ english: 'brief' })],
  );

  assert.deepEqual(result.words.map((item) => item.english), ['abandon', 'brief']);
  assert.equal(result.added, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.overflow, 0);
});

test('appendScannedWords stops at the wordbook limit', () => {
  const existing = Array.from({ length: 3 }, (_, index) => word({ english: `word${index}` }));
  const result = appendScannedWords(existing, [word({ english: 'extra' })], 3);

  assert.equal(result.words.length, 3);
  assert.equal(result.added, 0);
  assert.equal(result.overflow, 1);
});

test('appendScannedWords defaults to the official wordbook word limit', () => {
  const existing = Array.from({ length: MAX_OFFICIAL_WORDBOOK_WORDS }, (_, index) =>
    word({ english: `word${index}` }));
  const result = appendScannedWords(existing, [word({ english: 'extra' })]);

  assert.equal(result.added, 0);
  assert.equal(result.overflow, 1);
});

test('buildScanEnrichmentInputs asks only for the fields the scan did not produce', () => {
  const inputs = buildScanEnrichmentInputs([
    word({ english: 'abandon', distractors: ['a', 'b', 'c'], pronunciation: '/əˈbændən/' }),
    word({ english: 'brief', japanese: '' }),
  ]);

  assert.equal(inputs.length, 2);
  assert.deepEqual(inputs[0], {
    id: '0',
    english: 'abandon',
    japanese: '見捨てる',
    needs: { distractors: false, example: true, pronunciation: false, pos: true },
  });
  // 日本語訳が無い単語は「正解」が決まらないのでダミー選択肢を頼まない。
  assert.equal(inputs[1].needs.distractors, false);
});

test('buildScanEnrichmentInputs skips fully populated words', () => {
  const inputs = buildScanEnrichmentInputs([
    word({
      distractors: ['a', 'b', 'c'],
      exampleSentence: 'He abandoned the car.',
      exampleSentenceJa: '彼は車を捨てた。',
      pronunciation: '/əˈbændən/',
      partOfSpeechTags: ['動詞'],
    }),
  ]);

  assert.deepEqual(inputs, []);
});

test('applyScanEnrichment fills gaps without overwriting scanned values', () => {
  const words = [
    word({ english: 'abandon', distractors: ['既存1', '既存2', '既存3'] }),
    word({ english: 'brief', japanese: '簡潔な' }),
  ];

  const enriched = applyScanEnrichment(words, [
    {
      wordId: '0',
      distractors: ['生成1', '生成2', '生成3'],
      pronunciation: '/əˈbændən/',
      partOfSpeechTags: ['動詞'],
      exampleSentence: 'He abandoned the car.',
      exampleSentenceJa: '彼は車を捨てた。',
    },
    { wordId: '1', distractors: ['長い', '短い', '重い'], partOfSpeechTags: ['形容詞'] },
  ]);

  assert.deepEqual(enriched[0].distractors, ['既存1', '既存2', '既存3']);
  assert.equal(enriched[0].pronunciation, '/əˈbændən/');
  assert.equal(enriched[0].exampleSentence, 'He abandoned the car.');
  assert.deepEqual(enriched[1].distractors, ['長い', '短い', '重い']);
});

test('applyScanEnrichment leaves a generated example out unless both halves exist', () => {
  const enriched = applyScanEnrichment([word()], [
    { wordId: '0', exampleSentence: 'He abandoned the car.' },
  ]);

  assert.equal(enriched[0].exampleSentence, '');
  assert.equal(enriched[0].exampleSentenceJa, '');
});

test('applyScanEnrichment ignores results for unknown ids', () => {
  const enriched = applyScanEnrichment([word()], [{ wordId: '7', pronunciation: '/x/' }]);
  assert.equal(enriched[0].pronunciation, '');
});

test('describeScanGaps reports each empty column once', () => {
  const notes = describeScanGaps([
    word({ english: 'abandon', japanese: '' }),
    word({ english: 'give up', distractors: [] }),
  ]);

  assert.deepEqual(notes, [
    '日本語訳が空の単語が1語あります',
    'ダミー選択肢が空の単語が2語あります',
    '例文が空の単語が2語あります',
  ]);
});

test('describeScanGaps stays silent for a complete wordbook', () => {
  const notes = describeScanGaps([
    word({
      distractors: ['a', 'b', 'c'],
      exampleSentence: 'He abandoned the car.',
      exampleSentenceJa: '彼は車を捨てた。',
    }),
  ]);

  assert.deepEqual(notes, []);
});

test('officialWordbookScanRequestSchema requires an eiken level for the eiken mode', () => {
  const rejected = officialWordbookScanRequestSchema.safeParse({
    image: 'data:image/jpeg;base64,AAA',
    mode: 'eiken',
  });
  assert.equal(rejected.success, false);

  const accepted = officialWordbookScanRequestSchema.safeParse({
    image: 'data:image/jpeg;base64,AAA',
    mode: 'eiken',
    eikenLevel: 'pre1',
  });
  assert.equal(accepted.success, true);
});

test('officialWordbookScanRequestSchema defaults to the all mode with enrichment on', () => {
  const parsed = officialWordbookScanRequestSchema.safeParse({ image: 'data:image/jpeg;base64,AAA' });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.mode, 'all');
  assert.equal(parsed.data?.enrich, true);
});

test('officialWordbookScanRequestSchema rejects unknown keys and empty images', () => {
  assert.equal(
    officialWordbookScanRequestSchema.safeParse({ image: 'data:image/jpeg;base64,AAA', customPrompt: 'x' }).success,
    false,
  );
  assert.equal(officialWordbookScanRequestSchema.safeParse({ image: '' }).success, false);
});
