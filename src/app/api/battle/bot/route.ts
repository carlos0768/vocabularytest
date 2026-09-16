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
import { BATTLE_BOT_LEVELS, BATTLE_DEFAULT_BOT_LEVEL } from '@/lib/battle/bot';
import { createBotRoom } from '@/lib/battle/server';

const botRoomSchema = z.object({
  /** 出題に使う自分の単語帳。グループ内対戦のときだけ省略できる。 */
  projectId: z.string().uuid().optional(),
  /** 指定するとグループの単語帳から出題する（グループ内対戦のボット版）。 */
  groupId: z.string().uuid().optional(),
  level: z.enum(BATTLE_BOT_LEVELS).default(BATTLE_DEFAULT_BOT_LEVEL),
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
 * 人が集まらないときのボット対戦。待機列から抜けたうえで部屋を作るので、
 * 「ボットと対戦しながら人間ともマッチしていた」が起きない。直前に人間と
 * 組まれていた場合は、ボット戦を作らずその部屋を返す。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, botRoomSchema);
    if (!parsed.ok) return parsed.response;

    const room = await createBotRoom({
      userId: auth.user.id,
      projectId: parsed.data.projectId,
      groupId: parsed.data.groupId,
      botLevel: parsed.data.level,
      questionCount: parsed.data.questionCount,
      roundDurationMs: parsed.data.roundDurationMs,
    });

    return NextResponse.json({ success: true, roomId: room.id, room });
  } catch (error) {
    return battleErrorResponse(error, 'battle bot POST error');
  }
}
