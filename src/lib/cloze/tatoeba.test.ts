import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TATOEBA_LICENSE_CC0,
  TATOEBA_LICENSE_CC_BY,
  isQualityWarningTag,
  isUsableEnglishSentence,
  licenseFor,
  parseCc0Line,
  parseLinkLine,
  parseSentenceLine,
  pickJapaneseTranslation,
} from './tatoeba';

test('sentence lines are parsed, and \\N usernames become null', () => {
  assert.deepEqual(parseSentenceLine('1276\teng\tLet me try it.\tCK\t2010-01-01\t2011-01-01'), {
    id: 1276,
    lang: 'eng',
    text: 'Let me try it.',
    username: 'CK',
  });
  assert.equal(parseSentenceLine('77\tjpn\tやってみよう。\t\\N\t\\N\t\\N')?.username, null);
  assert.equal(parseSentenceLine('abc\teng\tHello.'), null);
  assert.equal(parseSentenceLine('5\teng\t'), null);
});

test('link and CC0 lines are parsed', () => {
  assert.deepEqual(parseLinkLine('1\t2'), [1, 2]);
  assert.equal(parseLinkLine('1'), null);
  const langs = new Set(['eng', 'jpn']);
  assert.equal(parseCc0Line('10\teng\tHi.\t2020', langs), 10);
  assert.equal(parseCc0Line('11\tfra\tSalut.\t2020', langs), null);
});

test('usable English sentences are single, plain, 4–20 word sentences', () => {
  assert.equal(isUsableEnglishSentence('I walk to school every day.'), true);
  assert.equal(isUsableEnglishSentence('Go.'), false, 'too short');
  assert.equal(isUsableEnglishSentence('i walk to school every day.'), false, 'lowercase start');
  assert.equal(isUsableEnglishSentence('I walk to school every day'), false, 'no terminal punctuation');
  assert.equal(isUsableEnglishSentence('He said "hello" to me.'), false, 'quotes');
  assert.equal(isUsableEnglishSentence('I have 3 brothers and sisters.'), false, 'digits');
  assert.equal(isUsableEnglishSentence('Hi there. How are you today?'), false, 'two sentences');
  assert.equal(
    isUsableEnglishSentence('This is a very long sentence that keeps going and going and going well past the twenty word limit for sure.'),
    false,
    'too long',
  );
});

test('quality warning tags are the @-prefixed review tags', () => {
  assert.equal(isQualityWarningTag('@needs native check'), true);
  assert.equal(isQualityWarningTag('@change'), true);
  assert.equal(isQualityWarningTag('proverb'), false);
});

test('license is CC0 only for sentences in the CC0 list', () => {
  const cc0 = new Set([5]);
  assert.equal(licenseFor(5, cc0), TATOEBA_LICENSE_CC0);
  assert.equal(licenseFor(6, cc0), TATOEBA_LICENSE_CC_BY);
});

test('translation choice prefers an attributable author, then the oldest id', () => {
  const picked = pickJapaneseTranslation([
    { id: 3, lang: 'jpn', text: '学校へ歩いて行きます。', username: null },
    { id: 9, lang: 'jpn', text: '歩いて学校に行く。', username: 'bob' },
    { id: 7, lang: 'jpn', text: '私は歩いて通学します。', username: 'amy' },
  ]);
  assert.equal(picked?.id, 7);
  assert.equal(pickJapaneseTranslation([{ id: 1, lang: 'jpn', text: 'abc', username: 'x' }]), null);
});
