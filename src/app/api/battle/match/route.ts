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
import {
  cancelRandomMatch,
  findActiveRoomForUser,
  requestGroupMatch,
  requestRandomMatch,
} from '@/lib/battle/server';

const matchSchema = z.object({
  /**
   * 出題に使う自分の単語帳。グループ内対戦はグループの単語帳から出題するので
   * 省略できる（下の refine で、グループ指定が無いときだけ必須にする）。
   */
  projectId: z.string().uuid().optional(),
  /** 指定するとそのグループのメンバー同士だけでマッチングする。 */
  groupId: z.string().uuid().optional(),
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
}).strict().refine(
  (value) => Boolean(value.groupId) || Boolean(value.projectId),
  { path: ['projectId'], message: '単語帳を選択してください。' },
);

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

    const result = parsed.data.groupId
      ? await requestGroupMatch({
        userId: auth.user.id,
        groupId: parsed.data.groupId,
        projectId: parsed.data.projectId,
        questionCount: parsed.data.questionCount,
        roundDurationMs: parsed.data.roundDurationMs,
      })
      : await requestRandomMatch({
        userId: auth.user.id,
        // refine 済み: グループ指定が無いここでは projectId が必ずある。
        projectId: parsed.data.projectId as string,
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
