import { NextRequest, NextResponse } from 'next/server';
import { battleErrorResponse, requireBattleUser } from '@/app/api/battle/shared';
import { loadBattleAllowance } from '@/lib/battle/entitlement';

/**
 * 対戦の入場権。ロビーが「今日あと何回できるか」を出すために読む。
 * Pro は無制限（limit / remaining は null）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireBattleUser(request);
    if (!auth.ok) return auth.response;

    const allowance = await loadBattleAllowance(auth.user.id);
    return NextResponse.json({ success: true, allowance });
  } catch (error) {
    return battleErrorResponse(error, 'battle entitlement GET error');
  }
}
