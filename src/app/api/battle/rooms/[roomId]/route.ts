import { NextRequest, NextResponse } from 'next/server';
import { battleErrorResponse, requireProBattleUser } from '@/app/api/battle/shared';
import { loadBattleQuestions, loadBattleRoom } from '@/lib/battle/server';

/**
 * Full battle state for a participant: the room plus every round that has
 * already started. Unstarted rounds are withheld so the set cannot be read ahead.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    const { roomId } = await context.params;
    const room = await loadBattleRoom(roomId, auth.user.id);
    const questions = await loadBattleQuestions(roomId);

    return NextResponse.json({ success: true, room, questions });
  } catch (error) {
    return battleErrorResponse(error, 'battle room GET error');
  }
}
