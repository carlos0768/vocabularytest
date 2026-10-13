import test from 'node:test';
import assert from 'node:assert/strict';

import { TIME_ATTACK_DURATION_MS, getTimeAttackRemainingMs } from './time-attack';

test('残り時間は経過とともに減り、0 未満にならない', () => {
  assert.equal(getTimeAttackRemainingMs(1000, 1000), TIME_ATTACK_DURATION_MS);
  assert.equal(getTimeAttackRemainingMs(1000, 4000), TIME_ATTACK_DURATION_MS - 3000);
  assert.equal(getTimeAttackRemainingMs(1000, 1000 + TIME_ATTACK_DURATION_MS + 5000), 0);
});
