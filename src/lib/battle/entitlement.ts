/**
 * 対戦の入場権（Pro は無制限 / Free は1日 `FREE_DAILY_BATTLE_LIMIT` 回）の
 * サーバー側の窓口。判定と記録は SECURITY DEFINER の RPC が持っていて、
 * ここはその呼び出しと型付けだけを引き受ける。
 *
 * 入り口（部屋作成・参加・マッチング・ボット戦・再戦）では `loadBattleAllowance`
 * で残数を見るだけにして、実際に減らすのは対戦が始まるとき（`startBattle` →
 * `consumeBattleEntry`）。相手が見つからないまま抜けた分を数えないため。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { BattleError } from '@/lib/battle/errors';
import {
  FREE_DAILY_BATTLE_LIMIT,
  getBattleAllowanceResetAt,
  getBattleDayKey,
  type BattleAllowance,
} from '@/lib/battle/free-allowance';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export const BATTLE_DAILY_LIMIT_MESSAGE =
  `本日の無料対戦（1日${FREE_DAILY_BATTLE_LIMIT}回）は使い切りました。明日0時に回復します。`;

type AllowanceRpcPayload = {
  is_pro?: boolean;
  day_key?: string;
  limit?: number | null;
  used?: number | null;
  remaining?: number | null;
  allowed?: boolean;
};

function toAllowance(payload: AllowanceRpcPayload | null): BattleAllowance {
  const isPro = Boolean(payload?.is_pro);
  const dayKey = payload?.day_key ?? getBattleDayKey();

  if (isPro) {
    return { isPro: true, limit: null, used: null, remaining: null, dayKey, resetsAt: null };
  }

  const limit = typeof payload?.limit === 'number' ? payload.limit : FREE_DAILY_BATTLE_LIMIT;
  const used = typeof payload?.used === 'number' ? payload.used : 0;
  const remaining = typeof payload?.remaining === 'number'
    ? payload.remaining
    : Math.max(0, limit - used);

  return {
    isPro: false,
    limit,
    used,
    remaining,
    dayKey,
    resetsAt: getBattleAllowanceResetAt().toISOString(),
  };
}

/** 現在の入場権。UIの残数表示と、入り口での事前チェックに使う。 */
export async function loadBattleAllowance(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<BattleAllowance> {
  const { data, error } = await admin.rpc('get_free_battle_allowance', { p_user_id: userId });

  if (error) {
    throw new BattleError('battle_allowance_lookup_failed', 500, '対戦の利用状況を取得できませんでした。');
  }

  return toAllowance(data as AllowanceRpcPayload | null);
}

/**
 * 対戦1回ぶんを記録する。同じ部屋で何度呼んでも1回しか減らない。
 * 枠が無いときは `battle_daily_limit_reached` を投げる。
 */
export async function consumeBattleEntry(
  userId: string,
  roomId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<BattleAllowance> {
  const { data, error } = await admin.rpc('consume_free_battle_entry', {
    p_user_id: userId,
    p_room_id: roomId,
  });

  if (error) {
    throw new BattleError('battle_allowance_consume_failed', 500, '対戦の開始に失敗しました。');
  }

  const payload = data as AllowanceRpcPayload | null;
  if (payload?.allowed === false) {
    throw new BattleError('battle_daily_limit_reached', 403, BATTLE_DAILY_LIMIT_MESSAGE);
  }

  return toAllowance(payload);
}

/**
 * 記録を取り消す。出題の生成に失敗して部屋を 'ready' に戻すときに呼ぶ
 * （始まらなかった対戦で枠を失わせない）。
 */
export async function releaseBattleEntries(
  roomId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<void> {
  await admin.from('battle_free_entries').delete().eq('room_id', roomId);
}
