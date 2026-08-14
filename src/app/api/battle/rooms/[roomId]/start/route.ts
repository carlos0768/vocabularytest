import { NextRequest, NextResponse } from 'next/server';
import { battleErrorResponse, requireProBattleUser } from '@/app/api/battle/shared';
import { loadBattleQuestions, startBattle } from '@/lib/battle/server';

/**
 * Generates the merged question set and opens round 0. Safe to call from both
 * clients -- `startBattle` claims the room atomically, so only one generates.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    const { roomId } = await context.params;
    const room = await startBattle({ roomId, userId: auth.user.id });
    const questions = await loadBattleQuestions(roomId);

    return NextResponse.json({ success: true, room, questions });
  } catch (error) {
    return battleErrorResponse(error, 'battle start error');
  }
}
