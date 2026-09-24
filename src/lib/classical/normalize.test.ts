import test from 'node:test';
import assert from 'node:assert/strict';

import {
  looksLikeClassicalJapanese,
  normalizeClassicalConjugationType,
  normalizeClassicalHeadword,
  normalizeClassicalPos,
  normalizeClassicalTranslationKey,
} from '@/lib/classical/normalize';

test('normalizeClassicalHeadword collapses whitespace and full-width forms', () => {
  assert.equal(normalizeClassicalHeadword('  あさまし  '), 'あさまし');
  assert.equal(normalizeClassicalHeadword('あさ まし'), 'あさまし');
  // NFKC で半角カナは全角に畳まれる
  assert.equal(normalizeClassicalHeadword('ｱｻﾏｼ'), 'アサマシ');
});

test('normalizeClassicalHeadword expands iteration marks instead of dropping them', () => {
  // 落とすと「こゝろ」が「ころ」になって別語と衝突し、共通辞書が壊れる
  assert.equal(normalizeClassicalHeadword('こゝろ'), 'こころ');
  assert.equal(normalizeClassicalHeadword('こゝろ'), normalizeClassicalHeadword('こころ'));
  assert.notEqual(normalizeClassicalHeadword('こゝろ'), normalizeClassicalHeadword('ころ'));
  // 濁点付きの繰り返しは結合濁点を足して畳む
  assert.equal(normalizeClassicalHeadword('すゞ'), 'すず');
});

test('normalizeClassicalHeadword strips stem/ending separators used by 古語辞典 headwords', () => {
  assert.equal(normalizeClassicalHeadword('か・ふ'), 'かふ');
  assert.equal(normalizeClassicalHeadword('うつくし−'), 'うつくし');
  // ダッシュ類は NFKC で統一されないので、代表的な符号を個別に確認する
  assert.equal(normalizeClassicalHeadword('うつくし–'), 'うつくし');
  assert.equal(normalizeClassicalHeadword('うつくし―'), 'うつくし');
});

test('normalizeClassicalHeadword keeps the prolonged sound mark, which is part of the word', () => {
  // 「ー」を区切り記号と一緒に消すと語が壊れる
  assert.equal(normalizeClassicalHeadword('ラーメン'), 'ラーメン');
  assert.equal(normalizeClassicalHeadword('コート'), 'コート');
});

test('normalizeClassicalHeadword does not lowercase (kana is unaffected either way)', () => {
  assert.equal(normalizeClassicalHeadword('ゆかし'), 'ゆかし');
  assert.equal(normalizeClassicalHeadword('心地'), '心地');
});

test('normalizeClassicalTranslationKey trims and collapses, returning null when empty', () => {
  assert.equal(normalizeClassicalTranslationKey('  驚きあきれる  '), '驚きあきれる');
  assert.equal(normalizeClassicalTranslationKey('驚き  あきれる'), '驚き あきれる');
  assert.equal(normalizeClassicalTranslationKey('   '), null);
});

test('normalizeClassicalPos collapses every phrasing of one POS to the same key', () => {
  // ここが崩れるとエントリが分裂してヒント流用が黙って効かなくなる。
  // 教材Aの「シク活用形容詞」と教材Bの「形容詞」は同じキーに落ちなければならない
  for (const label of ['シク活用形容詞', '形容詞・シク活用', '形シク', 'シク活用', '形容詞']) {
    assert.equal(normalizeClassicalPos(label), 'adjective', label);
  }
  for (const label of ['ハ行四段活用', '動詞・上二段活用', '下二段', 'カ行変格活用', 'サ変', '動詞']) {
    assert.equal(normalizeClassicalPos(label), 'verb', label);
  }
  for (const label of ['ナリ活用形容動詞', 'タリ活用', '形容動詞']) {
    assert.equal(normalizeClassicalPos(label), 'adjectival_noun', label);
  }
});

test('normalizeClassicalPos maps the remaining classical parts of speech', () => {
  assert.equal(normalizeClassicalPos('助動詞'), 'auxiliary');
  assert.equal(normalizeClassicalPos('助詞'), 'particle');
  assert.equal(normalizeClassicalPos('名詞'), 'noun');
  assert.equal(normalizeClassicalPos('代名詞'), 'noun');
  assert.equal(normalizeClassicalPos('副詞'), 'adverb');
  assert.equal(normalizeClassicalPos('連体詞'), 'adnominal');
  assert.equal(normalizeClassicalPos('接続詞'), 'conjunction');
  assert.equal(normalizeClassicalPos('感動詞'), 'interjection');
});

test('normalizeClassicalConjugationType keeps the conjugation out of the entry key', () => {
  assert.equal(normalizeClassicalConjugationType('シク活用形容詞'), 'シク活用');
  assert.equal(normalizeClassicalConjugationType('ハ行四段活用'), '四段活用');
  assert.equal(normalizeClassicalConjugationType('動詞・上二段活用'), '上二段活用');
  assert.equal(normalizeClassicalConjugationType('サ変'), 'サ行変格活用');
  assert.equal(normalizeClassicalConjugationType('ナリ活用形容動詞'), 'ナリ活用');
});

test('normalizeClassicalConjugationType returns nothing for a bare part of speech', () => {
  assert.equal(normalizeClassicalConjugationType('名詞'), undefined);
  assert.equal(normalizeClassicalConjugationType('助動詞'), undefined);
  assert.equal(normalizeClassicalConjugationType(null), undefined);
  assert.equal(normalizeClassicalConjugationType('  '), undefined);
});

test('normalizeClassicalConjugationType bounds unknown labels to the column limit', () => {
  const long = 'あ'.repeat(80);
  assert.equal(normalizeClassicalConjugationType(long)?.length, 40);
});

test('looksLikeClassicalJapanese only ever downgrades a mis-flagged English word', () => {
  assert.equal(looksLikeClassicalJapanese('あさまし'), true);
  assert.equal(looksLikeClassicalJapanese('心地'), true);
  // ラテン文字が混じっていたら古典語として扱わない
  assert.equal(looksLikeClassicalJapanese('apple'), false);
  assert.equal(looksLikeClassicalJapanese('apple りんご'), false);
  assert.equal(looksLikeClassicalJapanese(''), false);
  assert.equal(looksLikeClassicalJapanese(null), false);
});

test('normalizeClassicalPos does not confuse compound labels containing 動詞', () => {
  // 助動詞・形容動詞・感動詞はどれも「動詞」を含むので、先に固有ルールが当たること
  assert.notEqual(normalizeClassicalPos('助動詞'), 'verb');
  assert.notEqual(normalizeClassicalPos('形容動詞'), 'verb');
  assert.notEqual(normalizeClassicalPos('感動詞'), 'verb');
});

test('normalizeClassicalPos accepts already-normalized values and English tags', () => {
  assert.equal(normalizeClassicalPos('adjectival_noun'), 'adjectival_noun');
  assert.equal(normalizeClassicalPos('noun'), 'noun');
  assert.equal(normalizeClassicalPos('verb'), 'verb');
  assert.equal(normalizeClassicalPos('pronoun'), 'noun');
});

test('normalizeClassicalPos falls back to other so an AI value never breaks the insert', () => {
  assert.equal(normalizeClassicalPos(null), 'other');
  assert.equal(normalizeClassicalPos(undefined), 'other');
  assert.equal(normalizeClassicalPos(''), 'other');
  assert.equal(normalizeClassicalPos('なんらかの未知ラベル'), 'other');
});
