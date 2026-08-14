import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { battleErrorResponse, requireProBattleUser } from '@/app/api/battle/shared';
import { normalizeInviteCode } from '@/lib/battle/config';
import { joinRoomByInviteCode } from '@/lib/battle/server';

const joinSchema = z.object({
  inviteCode: z.string().trim().min(1).max(32),
  projectId: z.string().uuid(),
}).strict();

/** Joins a friend battle with an invite code. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, joinSchema);
    if (!parsed.ok) return parsed.response;

    const inviteCode = normalizeInviteCode(parsed.data.inviteCode);
    if (!inviteCode) {
      return NextResponse.json(
        { success: false, error: '招待コードの形式が正しくありません。', code: 'invalid_invite_code' },
        { status: 400 },
      );
    }

    const room = await joinRoomByInviteCode({
      userId: auth.user.id,
      projectId: parsed.data.projectId,
      inviteCode,
    });

    return NextResponse.json({ success: true, room });
  } catch (error) {
    return battleErrorResponse(error, 'battle join error');
  }
}
