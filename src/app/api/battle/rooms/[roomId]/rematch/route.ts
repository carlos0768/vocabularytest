import { NextRequest, NextResponse } from 'next/server';
import { battleErrorResponse, requireProBattleUser } from '@/app/api/battle/shared';
import { createOrJoinRematch } from '@/lib/battle/server';

/**
 * 決着後の「もう一度対戦する」。同じ相手・同じ設定の部屋を1つだけ作り、
 * 両者をそこへ集める（先に押した側がホストで待ち、後の側がゲストで入る）。
 * 両クライアントから同時に叩かれても、部屋は必ず1つに収束する。
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const auth = await requireProBattleUser(request);
    if (!auth.ok) return auth.response;

    const { roomId } = await context.params;
    const room = await createOrJoinRematch({ roomId, userId: auth.user.id });

    return NextResponse.json({ success: true, roomId: room.id, room });
  } catch (error) {
    return battleErrorResponse(error, 'battle rematch error');
  }
}
