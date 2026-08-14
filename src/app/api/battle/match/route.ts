import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { battleErrorResponse, requireProBattleUser } from '@/app/api/battle/shared';
import {
  BATTLE_DEFAULT_QUESTION_COUNT,
  BATTLE_DEFAULT_ROUND_DURATION_MS,
  BATTLE_MAX_QUESTION_COUNT,
  BATTLE_MAX_ROUND_DURATION_MS,
  BATTLE_MIN_QUESTION_COUNT,
  BATTLE_MIN_ROUND_DURATION_MS,
} from '@/lib/battle/config';
import { cancelRandomMatch, findActiveRoomForUser, requestRandomMatch } from '@/lib/battle/server';

const matchSchema = z.object({
  projectId: z.string().uuid(),
  questionCount: z
    .number()
    .int()
    .min(BATTLE_MIN_QUESTION_COUNT)
    .max(BATTLE_MAX_QUESTION_COUNT)
    .default(BATTLE_DEFAULT_QUESTION_COUNT),
  roundDurationMs: z
    .number()
    .int()
    .min(BATTLE_MIN_ROUND_DURATION_MS)
    .max(BATTLE_MAX_ROUND_DURATION_MS)
    .default(BATTLE_DEFAULT_ROUND_DURATION_MS),
}).strict();

/**
 * Enters random matchmaking. Pairing is atomic in the database, so returns
 * either the room the caller was matched into or a "queued" acknowledgement.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, matchSchema);
    if (!parsed.ok) return parsed.response;

    // Already paired (e.g. the client retried after a dropped response).
    const existing = await findActiveRoomForUser(auth.user.id);
    if (existing) {
      return NextResponse.json({ success: true, matched: true, roomId: existing.id, room: existing });
    }

    const result = await requestRandomMatch({
      userId: auth.user.id,
      projectId: parsed.data.projectId,
      questionCount: parsed.data.questionCount,
      roundDurationMs: parsed.data.roundDurationMs,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return battleErrorResponse(error, 'battle match POST error');
  }
}

/** Polling backstop for a waiting client in case the realtime event is missed. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    const room = await findActiveRoomForUser(auth.user.id);
    return NextResponse.json({
      success: true,
      matched: Boolean(room),
      roomId: room?.id ?? null,
      room,
    });
  } catch (error) {
    return battleErrorResponse(error, 'battle match GET error');
  }
}

/** Leaves the matchmaking queue. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    await cancelRandomMatch(auth.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return battleErrorResponse(error, 'battle match DELETE error');
  }
}
