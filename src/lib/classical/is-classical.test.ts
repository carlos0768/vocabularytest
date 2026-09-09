import test from 'node:test';
import assert from 'node:assert/strict';

import {
  excludeClassicalWords,
  isClassicalWord,
  selectClassicalWords,
} from '@/lib/classical/is-classical';

test('isClassicalWord accepts the extraction-time flag', () => {
  assert.equal(isClassicalWord({ isClassical: true }), true);
  assert.equal(isClassicalWord({ isClassical: false }), false);
});

test('isClassicalWord accepts a persisted dictionary link', () => {
  // words テーブルに is_classical 列は無く、classical_entry_id の有無が印になる
  assert.equal(isClassicalWord({ classicalEntryId: 'entry-1' }), true);
  assert.equal(isClassicalWord({ classicalEntryId: null }), false);
  assert.equal(isClassicalWord({ classicalEntryId: '' }), false);
});

test('isClassicalWord treats an unmarked or missing word as English', () => {
  // 既存の英単語は全部このパスを通るので、既定が false であることが重要
  assert.equal(isClassicalWord({}), false);
  assert.equal(isClassicalWord(null), false);
  assert.equal(isClassicalWord(undefined), false);
});

test('excludeClassicalWords keeps only the words English-only enrichment may touch', () => {
  const words = [
    { id: 'a', isClassical: false },
    { id: 'b', isClassical: true },
    { id: 'c', classicalEntryId: 'entry-1' },
    { id: 'd' },
  ];

  assert.deepEqual(excludeClassicalWords(words).map((word) => word.id), ['a', 'd']);
  assert.deepEqual(selectClassicalWords(words).map((word) => word.id), ['b', 'c']);
});
