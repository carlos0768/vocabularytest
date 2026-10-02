import assert from 'node:assert/strict';
import test from 'node:test';

import { nextHeaderHidden } from './use-hide-on-scroll';

test('hides when scrolling down and reveals when scrolling up', () => {
  assert.equal(nextHeaderHidden(false, 200, 260), true);
  assert.equal(nextHeaderHidden(true, 600, 540), false);
});

test('always shows near the top of the page, including iOS overscroll', () => {
  assert.equal(nextHeaderHidden(true, 0, 40), false);
  assert.equal(nextHeaderHidden(true, 10, -30), false);
});

test('ignores small jitter and keeps the current state', () => {
  assert.equal(nextHeaderHidden(true, 400, 397), true);
  assert.equal(nextHeaderHidden(false, 400, 403), false);
});
