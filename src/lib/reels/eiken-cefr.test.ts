import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EIKEN_TO_CEFR_BAND,
  cefrDistance,
  eikenDistance,
  eikenLevelsAround,
} from './eiken-cefr';

test('EIKEN_TO_CEFR_BAND covers all seven grades', () => {
  for (const level of ['5', '4', '3', 'pre2', '2', 'pre1', '1']) {
    const band = EIKEN_TO_CEFR_BAND[level];
    assert.ok(Array.isArray(band) && band.length > 0, `missing band for ${level}`);
  }
});

test('cefrDistance is 0 inside the band', () => {
  assert.equal(cefrDistance(['A2', 'B1'], 'A2'), 0);
  assert.equal(cefrDistance(['A2', 'B1'], 'B1'), 0);
});

test('cefrDistance counts steps outside the band', () => {
  assert.equal(cefrDistance(['B1'], 'A1'), 2);
  assert.equal(cefrDistance(['B1'], 'C1'), 2);
  assert.equal(cefrDistance(['A2', 'B1'], 'C2'), 3);
});

test('cefrDistance handles unknown values', () => {
  assert.equal(cefrDistance(['B1'], null), null);
  assert.equal(cefrDistance(['B1'], 'Z9'), null);
  assert.equal(cefrDistance([], 'B1'), null);
});

test('cefrDistance is case-insensitive', () => {
  assert.equal(cefrDistance(['B1'], 'b1'), 0);
});

test('eikenDistance measures grade steps', () => {
  assert.equal(eikenDistance('3', '3'), 0);
  assert.equal(eikenDistance('3', 'pre2'), 1);
  assert.equal(eikenDistance('5', '1'), 6);
  assert.equal(eikenDistance('unknown', '3'), null);
  assert.equal(eikenDistance(null, '3'), null);
});

test('eikenLevelsAround returns inclusive window clamped to bounds', () => {
  assert.deepEqual(eikenLevelsAround('3', 1), ['4', '3', 'pre2']);
  assert.deepEqual(eikenLevelsAround('5', 1), ['5', '4']);
  assert.deepEqual(eikenLevelsAround('1', 2), ['2', 'pre1', '1']);
  assert.deepEqual(eikenLevelsAround(null, 1), []);
  assert.deepEqual(eikenLevelsAround('nope', 1), []);
});
