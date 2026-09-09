import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterWordsForProjectKind,
  inferProjectKindFromWords,
  normalizeProjectKind,
  preferEnglishOverClassical,
  stripEnglishExampleFromClassicalWord,
  stripEnglishExamplesFromClassicalWords,
} from '@/lib/classical/purity';

const english = (english: string) => ({ english });
const classical = (headword: string) => ({ english: headword, isClassical: true });

test('preferEnglishOverClassical drops classical words when English is also present', () => {
  const { words, droppedClassicalCount } = preferEnglishOverClassical([
    english('admire'),
    classical('あさまし'),
    english('spare'),
  ]);

  assert.deepEqual(words.map((word) => word.english), ['admire', 'spare']);
  assert.equal(droppedClassicalCount, 1);
});

test('preferEnglishOverClassical leaves a classical-only page untouched', () => {
  const input = [classical('あさまし'), classical('ゆかし')];
  const { words, droppedClassicalCount } = preferEnglishOverClassical(input);

  assert.deepEqual(words.map((word) => word.english), ['あさまし', 'ゆかし']);
  assert.equal(droppedClassicalCount, 0);
});

test('preferEnglishOverClassical leaves an English-only page untouched', () => {
  const { words, droppedClassicalCount } = preferEnglishOverClassical([
    english('admire'),
    english('spare'),
  ]);

  assert.equal(words.length, 2);
  assert.equal(droppedClassicalCount, 0);
});

test('filterWordsForProjectKind keeps only what the wordbook accepts', () => {
  const words = [english('admire'), classical('あさまし'), english('spare')];

  const toEnglish = filterWordsForProjectKind(words, 'english');
  assert.deepEqual(toEnglish.words.map((word) => word.english), ['admire', 'spare']);
  assert.equal(toEnglish.droppedCount, 1);

  const toClassical = filterWordsForProjectKind(words, 'classical');
  assert.deepEqual(toClassical.words.map((word) => word.english), ['あさまし']);
  assert.equal(toClassical.droppedCount, 2);
});

test('filterWordsForProjectKind recognises a persisted classical link', () => {
  const words = [{ english: 'あさまし', classicalEntryId: 'entry-1' }, english('admire')];
  const kept = filterWordsForProjectKind(words, 'classical');
  assert.deepEqual(kept.words.map((word) => word.english), ['あさまし']);
});

test('inferProjectKindFromWords treats an empty wordbook as English', () => {
  assert.equal(inferProjectKindFromWords([]), 'english');
  assert.equal(inferProjectKindFromWords([english('admire')]), 'english');
  assert.equal(inferProjectKindFromWords([classical('あさまし')]), 'classical');
  // 1語でも古典語があれば古典単語帳とみなす
  assert.equal(inferProjectKindFromWords([english('admire'), classical('あさまし')]), 'classical');
});

test('normalizeProjectKind defaults anything unrecognised to English', () => {
  assert.equal(normalizeProjectKind('classical'), 'classical');
  assert.equal(normalizeProjectKind('english'), 'english');
  assert.equal(normalizeProjectKind(null), 'english');
  assert.equal(normalizeProjectKind(undefined), 'english');
  assert.equal(normalizeProjectKind('なにか'), 'english');
});

test('stripEnglishExampleFromClassicalWord drops an English example and its translation', () => {
  const word = stripEnglishExampleFromClassicalWord({
    english: 'あさまし',
    isClassical: true,
    exampleSentence: 'This is an English sentence.',
    exampleSentenceJa: 'これは英語の文です。',
  });

  assert.equal(word.exampleSentence, undefined);
  // 訳だけ残しても意味を成さないので対で落とす
  assert.equal(word.exampleSentenceJa, undefined);
});

test('stripEnglishExampleFromClassicalWord keeps a genuine classical example', () => {
  const input = {
    english: 'あさまし',
    isClassical: true,
    exampleSentence: 'いとあさましきことなり。',
    exampleSentenceJa: 'たいそう驚きあきれることである。',
  };
  const word = stripEnglishExampleFromClassicalWord(input);

  assert.equal(word.exampleSentence, 'いとあさましきことなり。');
  assert.equal(word.exampleSentenceJa, 'たいそう驚きあきれることである。');
});

test('stripEnglishExampleFromClassicalWord never touches an English word', () => {
  const input = {
    english: 'admire',
    exampleSentence: 'I admire her courage.',
    exampleSentenceJa: '私は彼女の勇気に敬服する。',
  };

  assert.equal(stripEnglishExampleFromClassicalWord(input), input);
});

test('stripEnglishExamplesFromClassicalWords reports how many it cleaned', () => {
  const { words, strippedCount } = stripEnglishExamplesFromClassicalWords([
    { english: 'あさまし', isClassical: true, exampleSentence: 'An English sentence.' },
    { english: 'ゆかし', isClassical: true, exampleSentence: 'いとゆかし。' },
    { english: 'admire', exampleSentence: 'I admire her.' },
  ]);

  assert.equal(strippedCount, 1);
  assert.equal(words[0].exampleSentence, undefined);
  assert.equal(words[1].exampleSentence, 'いとゆかし。');
  assert.equal(words[2].exampleSentence, 'I admire her.');
});
