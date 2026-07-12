import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLevelTestShareMessages,
  buildLevelTestShareUrl,
  formatVocabSize,
  formatVocabSizeFromTheta,
  vocabSizeTextFor,
} from './share';

test('buildLevelTestShareUrl builds the public result URL', () => {
  assert.equal(
    buildLevelTestShareUrl('https://www.merken.jp', 'AbC123-_'),
    'https://www.merken.jp/level-test/r/AbC123-_',
  );
  assert.equal(
    buildLevelTestShareUrl('https://www.merken.jp/', 'code'),
    'https://www.merken.jp/level-test/r/code',
  );
});

test('formatVocabSize renders a grouped Japanese number', () => {
  assert.equal(formatVocabSize(5), '7,500');
  assert.equal(formatVocabSize(0), '600');
});

test('formatVocabSizeFromTheta interpolates between level anchors', () => {
  assert.equal(formatVocabSizeFromTheta(5), '7,500');
  // 準1級と1級の中間(θ=5.5)は7,500と12,000の間
  assert.equal(formatVocabSizeFromTheta(5.5), '9,800');
});

test('vocabSizeTextFor prefers theta-based estimation and falls back to the level table', () => {
  // v2ペイロード(abilityあり)はθから補間
  assert.equal(vocabSizeTextFor({ finalLevel: 5, ability: 5.5 }), '9,800');
  // v1ペイロード(abilityなし)は級の固定値
  assert.equal(vocabSizeTextFor({ finalLevel: 5 }), '7,500');
});

test('share messages interpolate the grade label and vocab size on every platform', () => {
  const url = 'https://www.merken.jp/level-test/r/code';
  const messages = buildLevelTestShareMessages({ finalLevel: 5, clearedMax: false }, url);

  for (const text of [messages.native, messages.x, messages.line, messages.discord, messages.instagram]) {
    assert.ok(text.includes('英検準1級'), text);
    assert.ok(text.includes('7,500'), text);
  }
  assert.ok(messages.x.includes('#MERKEN'));
  assert.ok(messages.instagram.includes('#勉強垢'));
  // urlを含むのはintentに渡せないDiscord/Instagramのみ
  assert.ok(messages.discord.includes(url));
  assert.ok(messages.instagram.includes(url));
  assert.ok(!messages.x.includes(url));
  assert.ok(!messages.native.includes(url));
});

test('clearedMax prepends the crown line', () => {
  const messages = buildLevelTestShareMessages({ finalLevel: 6, clearedMax: true }, 'https://example.com');
  assert.ok(messages.native.includes('完全制覇'));
  assert.ok(messages.x.includes('完全制覇'));
});
