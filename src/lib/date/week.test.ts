import test from 'node:test';
import assert from 'node:assert/strict';

import { getCurrentWeekStartUtc } from './week';

test('getCurrentWeekStartUtc returns Monday 00:00 JST for a mid-week Wednesday', () => {
  // 2026-07-08 is a Wednesday. 12:00 UTC = 21:00 JST same day.
  const now = new Date('2026-07-08T12:00:00.000Z');
  const start = getCurrentWeekStartUtc(now);
  // Monday 2026-07-06 00:00 JST = 2026-07-05 15:00 UTC.
  assert.equal(start.toISOString(), '2026-07-05T15:00:00.000Z');
});

test('getCurrentWeekStartUtc returns the same instant just after the JST Monday boundary', () => {
  // 2026-07-05 15:00 UTC = 2026-07-06 00:00 JST exactly (Monday start).
  const now = new Date('2026-07-05T15:00:00.000Z');
  const start = getCurrentWeekStartUtc(now);
  assert.equal(start.toISOString(), '2026-07-05T15:00:00.000Z');
});

test('getCurrentWeekStartUtc returns the previous week just before the JST Monday boundary', () => {
  // One millisecond before the Monday 00:00 JST boundary.
  const now = new Date('2026-07-05T14:59:59.999Z');
  const start = getCurrentWeekStartUtc(now);
  // Previous Monday 2026-06-29 00:00 JST = 2026-06-28 15:00 UTC.
  assert.equal(start.toISOString(), '2026-06-28T15:00:00.000Z');
});

test('getCurrentWeekStartUtc handles a Sunday correctly (wraps to prior Monday)', () => {
  // 2026-07-12 is a Sunday. 03:00 UTC = 12:00 JST same day.
  const now = new Date('2026-07-12T03:00:00.000Z');
  const start = getCurrentWeekStartUtc(now);
  // Monday 2026-07-06 00:00 JST = 2026-07-05 15:00 UTC.
  assert.equal(start.toISOString(), '2026-07-05T15:00:00.000Z');
});
