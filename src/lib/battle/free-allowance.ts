/**
 * 無料ユーザーの1日の対戦枠。
 *
 * 対戦はProの機能だが、Freeでも1日 `FREE_DAILY_BATTLE_LIMIT` 回までは遊べる。
 * 消費するのは「実際に始まった対戦1部屋」で、ロビーで待っただけ・マッチング
 * を取り消しただけでは減らない（消費は `startBattle` が部屋を掴んだ後）。
 *
 * 数値は supabase/migrations/20260916130000_free_daily_battle_allowance.sql と
 * 二重に持っていて、`free-allowance.test.ts` が突き合わせている。変更は両方。
 */

export const FREE_DAILY_BATTLE_LIMIT = 2;

/** JST は UTC+9 固定（サマータイム無し）なので単純な加算で足りる。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** サーバー側の `battle_day_key()` と同じ「JST暦日」キー（YYYY-MM-DD）。 */
export function getBattleDayKey(at: Date = new Date()): string {
  return new Date(at.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 次に枠が戻る瞬間（JSTの翌0時）。UIの「明日0時にリセット」表示に使う。 */
export function getBattleAllowanceResetAt(at: Date = new Date()): Date {
  const jst = new Date(at.getTime() + JST_OFFSET_MS);
  const nextJstMidnight = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + 1,
  );
  return new Date(nextJstMidnight - JST_OFFSET_MS);
}

/**
 * 対戦の入り口で出す残数。Pro は無制限なので残数を持たない（null）。
 */
export type BattleAllowance = {
  isPro: boolean;
  /** Pro は null。 */
  limit: number | null;
  /** Pro は null。 */
  used: number | null;
  /** Pro は null。 */
  remaining: number | null;
  /** JST暦日のキー。 */
  dayKey: string;
  /** 枠が戻る時刻（ISO文字列）。Pro は null。 */
  resetsAt: string | null;
};

/** Pro は常に入れる。Free は残数が1以上のときだけ新しい対戦を始められる。 */
export function canStartBattle(allowance: BattleAllowance | null): boolean {
  if (!allowance) return false;
  if (allowance.isPro) return true;
  return (allowance.remaining ?? 0) > 0;
}

/** 「残り1回」「本日ぶんを使い切りました」などの短い説明文。 */
export function describeBattleAllowance(allowance: BattleAllowance): string {
  if (allowance.isPro) return 'Proプランは対戦し放題です。';
  const remaining = allowance.remaining ?? 0;
  if (remaining <= 0) {
    return `本日の無料対戦（1日${allowance.limit ?? FREE_DAILY_BATTLE_LIMIT}回）は使い切りました。`;
  }
  return `本日あと${remaining}回 / 1日${allowance.limit ?? FREE_DAILY_BATTLE_LIMIT}回まで`;
}
