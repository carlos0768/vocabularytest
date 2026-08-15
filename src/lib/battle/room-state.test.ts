import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canViewerAnswer,
  getBattleProgressLabel,
  getBattleResultForViewer,
  getRemainingMs,
  getRoundDeadline,
  getViewerParticipants,
  isRoomStartable,
  resolveSeat,
} from '@/lib/battle/room-state';
import type { BattleParticipant, BattleQuestion, BattleRoom } from '@/lib/battle/types';

function participant(userId: string, score = 0): BattleParticipant {
  return {
    userId,
    displayName: userId,
    avatarUrl: null,
    projectId: `${userId}-project`,
    projectTitle: 'テスト単語帳',
    score,
  };
}

function makeRoom(overrides: Partial<BattleRoom> = {}): BattleRoom {
  return {
    id: 'room-1',
    mode: 'friend',
    status: 'in_progress',
    inviteCode: 'ABCDEF',
    groupId: null,
    rematchOfRoomId: null,
    questionCount: 10,
    roundDurationMs: 15_000,
    currentRound: 0,
    host: participant('host'),
    guest: participant('guest'),
    winnerUserId: null,
    outcome: null,
    startedAt: '2026-08-14T00:00:00.000Z',
    finishedAt: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<BattleQuestion> = {}): BattleQuestion {
  return {
    roundIndex: 0,
    prompt: 'apple',
    choices: ['りんご', 'みかん', 'ぶどう', 'もも'],
    startedAt: '2026-08-14T00:00:00.000Z',
    resolvedAt: null,
    answeredBy: null,
    correctIndex: null,
    answer: null,
    ...overrides,
  };
}

const ROUND_START = Date.parse('2026-08-14T00:00:00.000Z');

test('resolveSeat identifies host, guest and outsiders', () => {
  const room = makeRoom();
  assert.equal(resolveSeat(room, 'host'), 'host');
  assert.equal(resolveSeat(room, 'guest'), 'guest');
  assert.equal(resolveSeat(room, 'stranger'), null);
});

test('getViewerParticipants swaps self and opponent per seat', () => {
  const room = makeRoom();

  const asHost = getViewerParticipants(room, 'host');
  assert.equal(asHost?.self.userId, 'host');
  assert.equal(asHost?.opponent?.userId, 'guest');

  const asGuest = getViewerParticipants(room, 'guest');
  assert.equal(asGuest?.self.userId, 'guest');
  assert.equal(asGuest?.opponent?.userId, 'host');

  assert.equal(getViewerParticipants(room, 'stranger'), null);
});

test('getViewerParticipants reports a missing opponent while waiting', () => {
  const room = makeRoom({ status: 'waiting', guest: null });
  const view = getViewerParticipants(room, 'host');

  assert.equal(view?.self.userId, 'host');
  assert.equal(view?.opponent, null);
});

test('getBattleResultForViewer is pending until the room finishes', () => {
  assert.equal(getBattleResultForViewer(makeRoom(), 'host'), 'pending');
});

test('getBattleResultForViewer reads win and loss from the winner', () => {
  const room = makeRoom({ status: 'finished', outcome: 'host', winnerUserId: 'host' });

  assert.equal(getBattleResultForViewer(room, 'host'), 'win');
  assert.equal(getBattleResultForViewer(room, 'guest'), 'lose');
});

test('getBattleResultForViewer treats a missing winner as a draw', () => {
  const room = makeRoom({ status: 'finished', outcome: 'draw', winnerUserId: null });

  assert.equal(getBattleResultForViewer(room, 'host'), 'draw');
  assert.equal(getBattleResultForViewer(room, 'guest'), 'draw');
});

test('an abandoned battle still resolves to win and loss', () => {
  const room = makeRoom({ status: 'finished', outcome: 'abandoned', winnerUserId: 'guest' });

  assert.equal(getBattleResultForViewer(room, 'guest'), 'win');
  assert.equal(getBattleResultForViewer(room, 'host'), 'lose');
});

test('getRoundDeadline is null before the round starts', () => {
  assert.equal(getRoundDeadline(makeQuestion({ startedAt: null }), 15_000), null);
});

test('getRoundDeadline adds the round duration to the server start time', () => {
  assert.equal(getRoundDeadline(makeQuestion(), 15_000), ROUND_START + 15_000);
});

test('getRemainingMs counts down and floors at zero', () => {
  const question = makeQuestion();

  assert.equal(getRemainingMs(question, 15_000, ROUND_START), 15_000);
  assert.equal(getRemainingMs(question, 15_000, ROUND_START + 6_000), 9_000);
  assert.equal(getRemainingMs(question, 15_000, ROUND_START + 60_000), 0);
});

test('canViewerAnswer allows a live round for a seated player', () => {
  assert.equal(
    canViewerAnswer({
      room: makeRoom(),
      question: makeQuestion(),
      userId: 'guest',
      hasAnswered: false,
      now: ROUND_START + 1_000,
    }),
    true,
  );
});

test('canViewerAnswer blocks a second attempt in the same round', () => {
  assert.equal(
    canViewerAnswer({
      room: makeRoom(),
      question: makeQuestion(),
      userId: 'guest',
      hasAnswered: true,
      now: ROUND_START + 1_000,
    }),
    false,
  );
});

test('canViewerAnswer blocks a resolved round', () => {
  assert.equal(
    canViewerAnswer({
      room: makeRoom(),
      question: makeQuestion({ resolvedAt: '2026-08-14T00:00:02.000Z', answeredBy: 'host' }),
      userId: 'guest',
      hasAnswered: false,
      now: ROUND_START + 3_000,
    }),
    false,
  );
});

test('canViewerAnswer blocks once the deadline has passed', () => {
  assert.equal(
    canViewerAnswer({
      room: makeRoom(),
      question: makeQuestion(),
      userId: 'guest',
      hasAnswered: false,
      now: ROUND_START + 15_001,
    }),
    false,
  );
});

test('canViewerAnswer blocks a stale round and non-participants', () => {
  const room = makeRoom({ currentRound: 3 });

  assert.equal(
    canViewerAnswer({
      room,
      question: makeQuestion({ roundIndex: 2 }),
      userId: 'guest',
      hasAnswered: false,
      now: ROUND_START + 1_000,
    }),
    false,
  );

  assert.equal(
    canViewerAnswer({
      room: makeRoom(),
      question: makeQuestion(),
      userId: 'stranger',
      hasAnswered: false,
      now: ROUND_START + 1_000,
    }),
    false,
  );
});

test('canViewerAnswer blocks while the battle is not in progress', () => {
  assert.equal(
    canViewerAnswer({
      room: makeRoom({ status: 'ready' }),
      question: makeQuestion(),
      userId: 'guest',
      hasAnswered: false,
      now: ROUND_START + 1_000,
    }),
    false,
  );
});

test('isRoomStartable requires a ready room with both seats filled', () => {
  assert.equal(isRoomStartable(makeRoom({ status: 'ready' })), true);
  assert.equal(isRoomStartable(makeRoom({ status: 'waiting', guest: null })), false);
  assert.equal(isRoomStartable(makeRoom({ status: 'in_progress' })), false);
});

test('getBattleProgressLabel is 1-based and clamps at the final round', () => {
  assert.equal(getBattleProgressLabel(makeRoom({ currentRound: 0 })), '1 / 10');
  assert.equal(getBattleProgressLabel(makeRoom({ currentRound: 9 })), '10 / 10');
  assert.equal(getBattleProgressLabel(makeRoom({ currentRound: 12 })), '10 / 10');
});
