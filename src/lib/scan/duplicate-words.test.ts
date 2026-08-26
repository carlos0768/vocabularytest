import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExistingWordKeys,
  countDuplicateWords,
  normalizeWordKey,
  setDuplicateWordsSelected,
  syncDuplicateSelection,
} from './duplicate-words';

interface TestWord {
  english: string;
  isDuplicate: boolean;
  isSelected: boolean;
}

function word(english: string, overrides: Partial<TestWord> = {}): TestWord {
  return { english, isDuplicate: false, isSelected: true, ...overrides };
}

test('normalizeWordKey は大文字小文字・空白・前後の記号の違いを吸収する', () => {
  assert.equal(normalizeWordKey('Apple'), 'apple');
  assert.equal(normalizeWordKey('  apple. '), 'apple');
  assert.equal(normalizeWordKey('look   up  to'), 'look up to');
  assert.equal(normalizeWordKey('"apple,"'), 'apple');
  assert.equal(normalizeWordKey('ａpple'), 'apple');
  assert.equal(normalizeWordKey(''), '');
});

test('normalizeWordKey は語の中の記号は残す', () => {
  assert.equal(normalizeWordKey("don't"), "don't");
  assert.equal(normalizeWordKey('e-mail'), 'e-mail');
});

test('buildExistingWordKeys は空・非文字列を無視する', () => {
  const keys = buildExistingWordKeys([
    { english: 'Apple' },
    { english: '   ' },
    { english: 123 as unknown as string },
    { english: 'banana' },
  ]);
  assert.deepEqual([...keys].sort(), ['apple', 'banana']);
});

test('既存の単語帳にある単語は重複として外れる', () => {
  const existing = buildExistingWordKeys([{ english: 'apple' }]);
  const result = syncDuplicateSelection([word('Apple'), word('banana')], existing, false);

  assert.deepEqual(result.map((w) => w.isDuplicate), [true, false]);
  assert.deepEqual(result.map((w) => w.isSelected), [false, true]);
  assert.equal(countDuplicateWords(result), 1);
});

test('「重複も追加する」を選ぶと重複単語も選択される', () => {
  const existing = buildExistingWordKeys([{ english: 'apple' }]);
  const flagged = syncDuplicateSelection([word('Apple'), word('banana')], existing, false);
  const result = setDuplicateWordsSelected(flagged, true);

  assert.deepEqual(result.map((w) => w.isDuplicate), [true, false]);
  assert.deepEqual(result.map((w) => w.isSelected), [true, true]);
});

test('setDuplicateWordsSelected は重複ではない単語に触らない', () => {
  const existing = buildExistingWordKeys([{ english: 'apple' }]);
  const flagged = syncDuplicateSelection([word('Apple'), word('banana', { isSelected: false })], existing, false);
  const result = setDuplicateWordsSelected(flagged, true);

  assert.equal(result[0].isSelected, true);
  assert.equal(result[1].isSelected, false);
});

test('1語だけ「追加する」に切り替えた選択は、別の単語を編集しても巻き戻らない', () => {
  const existing = buildExistingWordKeys([{ english: 'apple' }, { english: 'melon' }]);
  const flagged = syncDuplicateSelection([word('apple'), word('melon'), word('banana')], existing, false);
  // ユーザーが1語目だけ「追加する」にした
  const chosen = flagged.map((w, i) => (i === 0 ? { ...w, isSelected: true } : w));

  const afterEdit = syncDuplicateSelection(
    chosen.map((w, i) => (i === 2 ? { ...w, english: 'bananas' } : w)),
    existing,
    false,
  );

  assert.deepEqual(afterEdit.map((w) => w.isSelected), [true, false, true]);
});

test('同じスキャン結果内の2件目以降も重複として扱う（1件目は残す）', () => {
  const result = syncDuplicateSelection(
    [word('apple'), word('banana'), word('APPLE')],
    new Set<string>(),
    false,
  );

  assert.deepEqual(result.map((w) => w.isDuplicate), [false, false, true]);
  assert.deepEqual(result.map((w) => w.isSelected), [true, true, false]);
});

test('重複ではない単語の手動での選択解除は維持する', () => {
  const existing = buildExistingWordKeys([{ english: 'apple' }]);
  const result = syncDuplicateSelection(
    [word('banana', { isSelected: false }), word('Apple')],
    existing,
    false,
  );

  assert.equal(result[0].isSelected, false);
  assert.equal(result[1].isSelected, false);
  assert.equal(result[1].isDuplicate, true);
});

test('編集で重複でなくなった単語は選択状態に戻る', () => {
  const existing = buildExistingWordKeys([{ english: 'apple' }]);
  const flagged = syncDuplicateSelection([word('apple')], existing, false);
  assert.equal(flagged[0].isSelected, false);

  const edited = flagged.map((w) => ({ ...w, english: 'apply' }));
  const result = syncDuplicateSelection(edited, existing, false);

  assert.equal(result[0].isDuplicate, false);
  assert.equal(result[0].isSelected, true);
});

test('空の見出し語（手動追加の入力途中）は重複にしない', () => {
  const result = syncDuplicateSelection(
    [word(''), word('')],
    buildExistingWordKeys([{ english: '' }]),
    false,
  );

  assert.deepEqual(result.map((w) => w.isDuplicate), [false, false]);
  assert.deepEqual(result.map((w) => w.isSelected), [true, true]);
});

test('状態が変わらない単語は同じ参照のまま返す', () => {
  const words = [word('banana')];
  const result = syncDuplicateSelection(words, new Set<string>(), false);
  assert.equal(result[0], words[0]);
});
