import test from 'node:test';
import assert from 'node:assert/strict';

import { PROJECT_RECENT_USE_LIMIT, isRecordableProjectId, withProjectUse } from './recent-use';

const at = (iso: string) => new Date(iso);

test('横断の出題 (all) や空のIDは記録しない', () => {
  assert.equal(isRecordableProjectId('all'), false);
  assert.equal(isRecordableProjectId(''), false);
  assert.equal(isRecordableProjectId(undefined), false);
  assert.equal(isRecordableProjectId('3f2c-project-id'), true);
});

test('同じ単語帳は時刻を上書きし、新しい順に並ぶ', () => {
  let map = withProjectUse({}, 'a', at('2026-10-01T00:00:00Z'));
  map = withProjectUse(map, 'b', at('2026-10-02T00:00:00Z'));
  map = withProjectUse(map, 'a', at('2026-10-03T00:00:00Z'));
  assert.deepEqual(Object.keys(map), ['a', 'b']);
  assert.equal(map.a, '2026-10-03T00:00:00.000Z');
});

test('上限を超えたら古いものから捨てる', () => {
  let map = {};
  for (let i = 0; i < PROJECT_RECENT_USE_LIMIT + 5; i++) {
    map = withProjectUse(map, `p${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)));
  }
  const ids = Object.keys(map);
  assert.equal(ids.length, PROJECT_RECENT_USE_LIMIT);
  assert.equal(ids[0], `p${PROJECT_RECENT_USE_LIMIT + 4}`);
  assert.ok(!ids.includes('p0'));
});
