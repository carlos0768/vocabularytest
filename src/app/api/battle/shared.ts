import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { BattleError } from '@/lib/battle/errors';
import { BATTLE_DAILY_LIMIT_MESSAGE, loadBattleAllowance } from '@/lib/battle/entitlement';
import { canStartBattle, type BattleAllowance } from '@/lib/battle/free-allowance';

export type BattleAuthResult =
  | { ok: true; user: { id: string } }
  | { ok: false; response: NextResponse };

export type BattleEntryAuthResult =
  | { ok: true; user: { id: string }; allowance: BattleAllowance }
  | { ok: false; response: NextResponse };

/**
 * ログインだけを確かめる。すでに始まっている対戦の読み書き（部屋の取得、
 * 回答、退出）はプランに関係なく通す —— 途中で枠が尽きても、進行中の対戦が
 * 読めなくなってはいけない。
 *
 * 入場権は**引かない**。部屋の取得は対戦中ずっとポーリングされるので、
 * ここに問い合わせを1本足すと1対戦につき何十回も余計に叩くことになる。
 */
export async function requireBattleUser(request: NextRequest): Promise<BattleAuthResult> {
  return requireAuthenticatedUser(request);
}

/**
 * 新しい対戦に入る操作（部屋作成・招待コード参加・マッチング・ボット戦・再戦）用。
 * Pro は無制限、Free は1日の残り枠があるときだけ通す。
 *
 * ここでは減らさず見るだけ。実際に1回ぶんを数えるのは対戦が始まるとき
 * (`startBattle`) なので、相手が見つからずロビーを抜けた分は消費されない。
 */
export async function requireBattleEntryUser(
  request: NextRequest,
): Promise<BattleEntryAuthResult> {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth;

  const allowance = await loadBattleAllowance(auth.user.id);

  if (!canStartBattle(allowance)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: BATTLE_DAILY_LIMIT_MESSAGE,
          code: 'battle_daily_limit_reached',
          allowance,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user: auth.user, allowance };
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
