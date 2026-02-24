import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvList } from './config';

test('parseCsvList trims values and removes duplicates', () => {
  const parsed = parseCsvList('  com.app.monthly , com.app.yearly,com.app.monthly ,, ');
  assert.deepEqual(parsed, ['com.app.monthly', 'com.app.yearly']);
});

test('parseCsvList returns empty array for empty input', () => {
  assert.deepEqual(parseCsvList(undefined), []);
  assert.deepEqual(parseCsvList(null), []);
  assert.deepEqual(parseCsvList(''), []);
});

