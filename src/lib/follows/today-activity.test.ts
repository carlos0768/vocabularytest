import assert from 'node:assert/strict';
import test from 'node:test';

import type { FriendProfile } from '@/lib/friends/types';
import { aggregateFollowingTodayActivity, jstDayStartIso } from './today-activity';

const profile = (userId: string): FriendProfile => ({
  userId,
  username: userId,
  accountId: userId,
  avatarUrl: null,
});

test('jstDayStartIso cuts the day at JST midnight, not UTC midnight', () => {
  // 2026-10-02 08:30 JST = 2026-10-01 23:30 UTC
  assert.equal(jstDayStartIso(new Date('2026-10-01T23:30:00Z')), '2026-10-01T15:00:00.000Z');
  // 2026-10-02 08:59 JST is still the same JST day
  assert.equal(jstDayStartIso(new Date('2026-10-01T23:59:00Z')), '2026-10-01T15:00:00.000Z');
  // 2026-10-01 23:59 JST belongs to the previous JST day
  assert.equal(jstDayStartIso(new Date('2026-10-01T14:59:00Z')), '2026-09-30T15:00:00.000Z');
});

test('aggregateFollowingTodayActivity sums today sessions per followed user, newest first', () => {
  const dayStart = '2026-10-01T15:00:00.000Z';
  const result = aggregateFollowingTodayActivity(
    [
      { user_id: 'a', last_answered_at: '2026-10-01T16:00:00Z', answer_count: 10 },
      { user_id: 'a', last_answered_at: '2026-10-02T01:00:00Z', answer_count: '5' },
      { user_id: 'b', last_answered_at: '2026-10-02T03:00:00Z', answer_count: 3 },
      // yesterday (JST)
      { user_id: 'b', last_answered_at: '2026-10-01T14:00:00Z', answer_count: 50 },
      // not followed (e.g. the viewer themself)
      { user_id: 'me', last_answered_at: '2026-10-02T03:00:00Z', answer_count: 9 },
      // zero answers
      { user_id: 'c', last_answered_at: '2026-10-02T03:00:00Z', answer_count: 0 },
    ],
    ['a', 'b', 'c'],
    new Map([['a', profile('a')]]),
    dayStart,
    profile,
  );

  assert.deepEqual(
    result.map((item) => [item.userId, item.answerCount, item.lastAnsweredAt]),
    [
      ['b', 3, '2026-10-02T03:00:00Z'],
      ['a', 15, '2026-10-02T01:00:00Z'],
    ],
  );
  assert.equal(result[1].profile.accountId, 'a');
});
