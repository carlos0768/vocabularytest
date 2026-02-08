import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_SYNC_INTERVAL_MS, shouldRunFullSync } from './hybrid-repository';

const USER_ID = 'user_123';
const FIXED_NOW = new Date('2026-02-08T12:00:00.000Z').getTime();

test('shouldRunFullSync returns true when synced user differs', () => {
  const run = shouldRunFullSync(FIXED_NOW, 'other_user', USER_ID, FIXED_NOW);
  assert.equal(run, true);
});

test('shouldRunFullSync returns true when lastSync is missing', () => {
  const run = shouldRunFullSync(null, USER_ID, USER_ID, FIXED_NOW);
  assert.equal(run, true);
});

test('shouldRunFullSync returns false within 1 hour for same user', () => {
  const thirtyMinutesAgo = FIXED_NOW - 30 * 60 * 1000;
  const run = shouldRunFullSync(thirtyMinutesAgo, USER_ID, USER_ID, FIXED_NOW);
  assert.equal(run, false);
});

test('shouldRunFullSync returns true after 1 hour for same user', () => {
  const twoHoursAgo = FIXED_NOW - 2 * 60 * 60 * 1000;
  const run = shouldRunFullSync(twoHoursAgo, USER_ID, USER_ID, FIXED_NOW);
  assert.equal(run, true);
});

test('FULL_SYNC_INTERVAL_MS is fixed to 1 hour', () => {
  assert.equal(FULL_SYNC_INTERVAL_MS, 60 * 60 * 1000);
});
