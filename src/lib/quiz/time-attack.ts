/**
 * タイムアタック (制限時間つきの四択)。
 *
 * 出題画面の形式 `timeattack` で動く。対戦の早押しと同じく、1問ごとに制限時間があり、
 * 時間切れは不正解として記録して正解を見せる。Passive の語だけを出す
 * (`matchesAnswerFormat`)。
 */

/** 1問あたりの制限時間 (ミリ秒)。 */
export const TIME_ATTACK_DURATION_MS = 10_000;

/** 残り時間の更新間隔 (ミリ秒)。バーがなめらかに減る程度。 */
export const TIME_ATTACK_TICK_MS = 100;

/** 残りがこの時間を切ったら赤くして急かす (ミリ秒)。 */
export const TIME_ATTACK_URGENT_MS = 3_000;

/** 開始時刻から見た残り時間。0 未満にはしない。 */
export function getTimeAttackRemainingMs(startedAt: number, now: number, durationMs = TIME_ATTACK_DURATION_MS): number {
  return Math.max(0, durationMs - (now - startedAt));
}
