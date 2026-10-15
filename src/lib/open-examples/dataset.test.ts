import assert from 'node:assert/strict';
import test from 'node:test';
import rawDataset from './dataset.json';
import {
  japaneseHintAppearsIn,
  parseOpenExampleDataset,
  selectOpenExample,
  tokenizeExampleHint,
  type OpenExampleDataset,
} from './dataset';
import { applyOpenDataExamples } from './server';

const FIXTURE: OpenExampleDataset = {
  version: 1,
  generatedAt: '2026-10-15',
  sources: [{ name: 'Tatoeba', license: 'CC BY 2.0 FR', url: 'https://tatoeba.org/' }],
  pairs: [
    [1, 'I deposited money in the bank.', 11, '私は銀行にお金を預けた。'],
    [2, 'We sat on the bank of the river.', 12, '私たちは川の土手に座った。'],
    [3, 'Tom gave up smoking last year.', 13, 'トムは去年タバコをやめた。'],
    [4, 'He finally gave up on his dream.', 14, '彼はついに夢を諦めた。'],
    [5, 'I bought a book in Japan.', 15, '私は日本で本を買った。'],
    [6, 'He ran to the station.', 16, '彼は駅まで走った。'],
  ],
  entries: {
    bank: [0, 1],
    'give up': [2, 3],
    book: [4],
    run: [5],
  },
};

test('the committed dataset parses and credits Tatoeba', () => {
  const dataset = parseOpenExampleDataset(rawDataset);
  assert.equal(dataset.version, 1);
  assert.ok(dataset.sources.some((source) => source.name === 'Tatoeba' && source.license === 'CC BY 2.0 FR'));
});

test('picks the example whose Japanese matches the wordbook translation (sense)', () => {
  assert.equal(selectOpenExample(FIXTURE, 'bank', ['銀行'])?.exampleSentence, 'I deposited money in the bank.');
  assert.equal(selectOpenExample(FIXTURE, 'bank', ['土手'])?.exampleSentence, 'We sat on the bank of the river.');
  assert.equal(selectOpenExample(FIXTURE, 'bank', ['1.銀行 2.土手'])?.exampleSentence, 'I deposited money in the bank.');
});

test('returns null rather than an example of another sense', () => {
  assert.equal(selectOpenExample(FIXTURE, 'bank', ['傾く']), null);
  assert.equal(selectOpenExample(FIXTURE, 'bank', []), null);
  assert.equal(selectOpenExample(FIXTURE, 'unknown', ['銀行']), null);
});

test('matches conjugated Japanese through the stem', () => {
  // 諦める → 諦めた
  const example = selectOpenExample(FIXTURE, 'give up', ['諦める']);
  assert.equal(example?.exampleSentence, 'He finally gave up on his dream.');
  assert.equal(example?.tatoebaEnglishId, 4);
  assert.equal(example?.tatoebaJapaneseId, 14);
  // 走る → 走った (漢字1文字の語幹は用言として使われているときだけ)
  assert.equal(selectOpenExample(FIXTURE, 'run', ['走る'])?.exampleSentence, 'He ran to the station.');
  // 学習者の書き方 (to ~ / 句動詞の補足) を寄せて引く
  assert.equal(selectOpenExample(FIXTURE, 'to give up', ['やめる'])?.exampleSentence, 'Tom gave up smoking last year.');
});

test('single-kanji translations do not match inside compounds', () => {
  assert.equal(japaneseHintAppearsIn('本', '私は日本で本を買った。'), true);
  assert.equal(japaneseHintAppearsIn('本', '日本に行った。'), false);
  // 行う → 行 は「銀行」の中では一致しない
  assert.equal(japaneseHintAppearsIn('行う', '銀行に行った。'), true);
  assert.equal(japaneseHintAppearsIn('行う', '銀行が閉まった。'), false);
  // 仮名だけの訳は最後の1文字を活用ぶんとして見る
  assert.equal(japaneseHintAppearsIn('あきらめる', '彼はあきらめた。'), true);
});

test('tokenizes numbered and delimited translations, keeping single kanji', () => {
  assert.deepEqual(tokenizeExampleHint('1.銀行 2.土手、堤防'), ['銀行', '土手', '堤防']);
  assert.deepEqual(tokenizeExampleHint('本'), ['本']);
  assert.deepEqual(tokenizeExampleHint('な'), []);
});

test('applyOpenDataExamples overrides stocked examples only when a matching example exists', () => {
  const words = [
    { english: 'bank', japanese: '銀行', exampleSentence: 'AI sentence.', exampleSentenceJa: 'AIの文。' },
    { english: 'bank', japanese: '傾く', exampleSentence: 'AI sentence.', exampleSentenceJa: 'AIの文。' },
    { english: 'give up', japanese: '断念する', translations: [{ translationJa: '諦める' }] },
    { english: 'run', japanese: '走る', classicalEntryId: 'classical-1' },
  ];
  const result = applyOpenDataExamples(words, FIXTURE);
  assert.equal(result.appliedCount, 2);
  assert.equal(result.words[0].exampleSentence, 'I deposited money in the bank.');
  assert.equal(result.words[0].exampleSentenceJa, '私は銀行にお金を預けた。');
  // 合う例文が無ければ辞書から転記済みの例文が残る
  assert.equal(result.words[1].exampleSentence, 'AI sentence.');
  // word_translations の別の訳でも引ける
  assert.equal(result.words[2].exampleSentence, 'He finally gave up on his dream.');
  // 古典語には英語の例文を付けない
  assert.equal(result.words[3].exampleSentence, undefined);
  // 入力は書き換えない
  assert.equal(words[0].exampleSentence, 'AI sentence.');
});

test('applyOpenDataExamples is a no-op with an empty dataset', () => {
  const words = [{ english: 'bank', japanese: '銀行' }];
  const result = applyOpenDataExamples(words, { ...FIXTURE, pairs: [], entries: {} });
  assert.equal(result.appliedCount, 0);
  assert.deepEqual(result.words, words);
});
