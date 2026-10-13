import test from 'node:test';
import assert from 'node:assert/strict';

import { JST_OFFSET_MS, jstDayKey, jstDayStartIso } from './jst';

test('JST_OFFSET_MS is UTC+9', () => {
  assert.equal(JST_OFFSET_MS, 9 * 60 * 60 * 1000);
});

test('jstDayKey rolls over at JST midnight (15:00 UTC)', () => {
  assert.equal(jstDayKey(new Date('2026-01-01T14:59:59Z')), '2026-01-01');
  assert.equal(jstDayKey(new Date('2026-01-01T15:00:00Z')), '2026-01-02');
  assert.equal(jstDayKey(new Date('2025-12-31T15:00:00Z')), '2026-01-01');
});

test('jstDayStartIso returns the UTC instant of the JST day start', () => {
  assert.equal(jstDayStartIso(new Date('2026-01-01T14:59:59Z')), '2025-12-31T15:00:00.000Z');
  assert.equal(jstDayStartIso(new Date('2026-01-01T15:00:00Z')), '2026-01-01T15:00:00.000Z');
  assert.equal(jstDayStartIso(new Date('2026-01-01T23:30:00Z')), '2026-01-01T15:00:00.000Z');
});
