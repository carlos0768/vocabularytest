import assert from 'node:assert/strict';
import test from 'node:test';

import { followSuggestionLabel, rankFollowSuggestions } from './suggestions';

test('ranks friends-of-follows by mutual count, then friends, then group members', () => {
  const result = rankFollowSuggestions({
    viewerId: 'me',
    excludedUserIds: ['followed', 'pending'],
    secondDegreeFollowingIds: ['x', 'y', 'x', 'me', 'followed', 'x', 'y', 'z'],
    friendIds: ['f', 'x', 'pending'],
    groupMemberIds: ['g', 'f', 'me'],
  });

  assert.deepEqual(
    result.map((item) => [item.userId, item.reason, item.mutualCount]),
    [
      ['x', 'mutual', 3],
      ['y', 'mutual', 2],
      ['z', 'mutual', 1],
      ['f', 'friend', 0],
      ['g', 'group', 0],
    ],
  );
});

test('respects the limit and returns nothing when there are no candidates', () => {
  assert.equal(
    rankFollowSuggestions({
      viewerId: 'me',
      excludedUserIds: [],
      secondDegreeFollowingIds: ['a', 'b', 'c'],
      friendIds: [],
      groupMemberIds: [],
      limit: 2,
    }).length,
    2,
  );
  assert.deepEqual(
    rankFollowSuggestions({ viewerId: 'me', excludedUserIds: [], secondDegreeFollowingIds: [], friendIds: [], groupMemberIds: [] }),
    [],
  );
});

test('followSuggestionLabel describes why the user is suggested', () => {
  assert.equal(followSuggestionLabel({ reason: 'mutual', mutualCount: 4 }), '共通のフォロー4人');
  assert.equal(followSuggestionLabel({ reason: 'friend', mutualCount: 0 }), 'フレンド');
  assert.equal(followSuggestionLabel({ reason: 'group', mutualCount: 0 }), '同じグループ');
});
