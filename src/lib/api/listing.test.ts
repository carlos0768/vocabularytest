import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeOffsetCursor,
  encodeOffsetCursor,
  includesSearchText,
  normalizeHandleSearchQuery,
  normalizeSearchQuery,
} from './listing';

test('offset cursors round-trip', () => {
  assert.equal(decodeOffsetCursor(encodeOffsetCursor(40)), 40);
});

test('decodeOffsetCursor falls back to 0 for missing, malformed or non-positive cursors', () => {
  assert.equal(decodeOffsetCursor(null), 0);
  assert.equal(decodeOffsetCursor(undefined), 0);
  assert.equal(decodeOffsetCursor(''), 0);
  assert.equal(decodeOffsetCursor('not-a-cursor'), 0);
  assert.equal(decodeOffsetCursor(encodeOffsetCursor(-5)), 0);
  assert.equal(decodeOffsetCursor(Buffer.from('{"offset":"3"}').toString('base64url')), 0);
});

test('decodeOffsetCursor floors fractional offsets', () => {
  assert.equal(decodeOffsetCursor(encodeOffsetCursor(12.7)), 12);
});

test('normalizeSearchQuery trims and lowercases but keeps a leading @', () => {
  assert.equal(normalizeSearchQuery('  Hello '), 'hello');
  assert.equal(normalizeSearchQuery('@Alice'), '@alice');
  assert.equal(normalizeSearchQuery(null), '');
});

test('normalizeHandleSearchQuery also strips leading @', () => {
  assert.equal(normalizeHandleSearchQuery('  @@Alice '), 'alice');
  assert.equal(normalizeHandleSearchQuery(undefined), '');
});

test('includesSearchText matches case-insensitively and treats null as no match', () => {
  assert.equal(includesSearchText('Target Vocabulary', 'vocab'), true);
  assert.equal(includesSearchText('Target', 'x'), false);
  assert.equal(includesSearchText(null, 'x'), false);
});
