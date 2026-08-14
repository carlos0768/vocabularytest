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
import { createFriendRoom, findActiveRoomForUser } from '@/lib/battle/server';

const createRoomSchema = z.object({
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

/** Returns the battle the caller is currently in, if any. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    const room = await findActiveRoomForUser(auth.user.id);
    return NextResponse.json({ success: true, room });
  } catch (error) {
    return battleErrorResponse(error, 'battle rooms GET error');
  }
}

/** Creates a friend battle room and returns its invite code. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, createRoomSchema);
    if (!parsed.ok) return parsed.response;

    const room = await createFriendRoom({
      userId: auth.user.id,
      projectId: parsed.data.projectId,
      questionCount: parsed.data.questionCount,
      roundDurationMs: parsed.data.roundDurationMs,
    });

    return NextResponse.json({ success: true, room });
  } catch (error) {
    return battleErrorResponse(error, 'battle rooms POST error');
  }
}
