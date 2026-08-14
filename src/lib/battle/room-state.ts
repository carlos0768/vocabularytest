import type { BattleParticipant, BattleQuestion, BattleRoom, BattleSeat } from '@/lib/battle/types';

export type BattleResultForViewer = 'win' | 'lose' | 'draw' | 'pending';

export function resolveSeat(room: BattleRoom, userId: string): BattleSeat | null {
  if (room.host.userId === userId) return 'host';
  if (room.guest?.userId === userId) return 'guest';
  return null;
}

export function getViewerParticipants(
  room: BattleRoom,
  userId: string,
): { self: BattleParticipant; opponent: BattleParticipant | null } | null {
  const seat = resolveSeat(room, userId);
  if (!seat) return null;

  return seat === 'host'
    ? { self: room.host, opponent: room.guest }
    : { self: room.guest as BattleParticipant, opponent: room.host };
}

export function getBattleResultForViewer(room: BattleRoom, userId: string): BattleResultForViewer {
  if (room.status !== 'finished') return 'pending';
  if (room.outcome === 'draw' || room.winnerUserId === null) return 'draw';
  return room.winnerUserId === userId ? 'win' : 'lose';
}

/** Epoch ms at which the current round expires, or null before it starts. */
export function getRoundDeadline(question: BattleQuestion, roundDurationMs: number): number | null {
  if (!question.startedAt) return null;
  return new Date(question.startedAt).getTime() + roundDurationMs;
}

export function getRemainingMs(
  question: BattleQuestion,
  roundDurationMs: number,
  now: number,
): number {
  const deadline = getRoundDeadline(question, roundDurationMs);
  if (deadline === null) return roundDurationMs;
  return Math.max(0, deadline - now);
}

/**
 * Whether the viewer may still buzz in. One attempt per player per round, and
 * the round must be live. The server re-checks all of this -- this only keeps
 * the UI honest.
 */
export function canViewerAnswer(options: {
  room: BattleRoom;
  question: BattleQuestion | null;
  userId: string;
  hasAnswered: boolean;
  now: number;
}): boolean {
  const { room, question, userId, hasAnswered, now } = options;
  if (!question || hasAnswered) return false;
  if (room.status !== 'in_progress') return false;
  if (question.roundIndex !== room.currentRound) return false;
  if (question.resolvedAt) return false;
  if (!resolveSeat(room, userId)) return false;
  return getRemainingMs(question, room.roundDurationMs, now) > 0;
}

/** True once both seats are filled and the battle can be started. */
export function isRoomStartable(room: BattleRoom): boolean {
  return room.status === 'ready' && room.guest !== null;
}

export function getBattleProgressLabel(room: BattleRoom): string {
  const current = Math.min(room.currentRound + 1, room.questionCount);
  return `${current} / ${room.questionCount}`;
}
