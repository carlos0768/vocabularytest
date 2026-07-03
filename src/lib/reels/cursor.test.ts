import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeReelCursor, encodeReelCursor } from './cursor';

test('encode/decode round-trips', () => {
  const cursor = { seed: 123456, page: 3 };
  assert.deepEqual(decodeReelCursor(encodeReelCursor(cursor)), cursor);
});

test('decode rejects garbage', () => {
  assert.equal(decodeReelCursor('not-base64-json'), null);
  assert.equal(decodeReelCursor(''), null);
  assert.equal(decodeReelCursor(null), null);
  assert.equal(decodeReelCursor(undefined), null);
});

test('decode rejects out-of-range values', () => {
  assert.equal(decodeReelCursor(encodeReelCursor({ seed: -1, page: 0 })), null);
  assert.equal(decodeReelCursor(encodeReelCursor({ seed: 2 ** 40, page: 0 })), null);
  assert.equal(decodeReelCursor(encodeReelCursor({ seed: 1, page: -2 })), null);
  assert.equal(decodeReelCursor(encodeReelCursor({ seed: 1, page: 999_999 })), null);
});

test('decode rejects non-numeric fields', () => {
  const bogus = Buffer.from(JSON.stringify({ seed: 'a', page: 1 }), 'utf8').toString('base64url');
  assert.equal(decodeReelCursor(bogus), null);
});
