import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { isUserActivePro } from '@/app/api/shared-projects/pro';
import { BattleError } from '@/lib/battle/server';

export const BATTLE_PRO_REQUIRED_MESSAGE = 'リアルタイム対戦はProプラン限定の機能です。';

export type BattleAuthResult =
  | { ok: true; user: { id: string } }
  | { ok: false; response: NextResponse };

/**
 * Authenticates the caller and enforces the Pro gate. Battles cost no coins, so
 * an active Pro subscription is the only entitlement checked.
 */
export async function requireProBattleUser(request: NextRequest): Promise<BattleAuthResult> {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth;

  const isPro = await isUserActivePro(auth.user.id);
  if (!isPro) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: BATTLE_PRO_REQUIRED_MESSAGE, code: 'pro_required' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user: auth.user };
}

export function battleErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof BattleError) {
    return NextResponse.json(
      { success: false, error: error.userMessage, code: error.code },
      { status: error.status },
    );
  }

  console.error(`${context}:`, error);
  return NextResponse.json(
    { success: false, error: '対戦の処理に失敗しました。' },
    { status: 500 },
  );
}
