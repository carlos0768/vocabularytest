/** Shared tuning constants for リアルタイム単語対戦. */

export const BATTLE_DEFAULT_QUESTION_COUNT = 10;
export const BATTLE_MIN_QUESTION_COUNT = 3;
export const BATTLE_MAX_QUESTION_COUNT = 30;

export const BATTLE_DEFAULT_ROUND_DURATION_MS = 15_000;
export const BATTLE_MIN_ROUND_DURATION_MS = 3_000;
export const BATTLE_MAX_ROUND_DURATION_MS = 60_000;

/** How long the result of a resolved round stays on screen before advancing. */
export const BATTLE_ROUND_REVEAL_MS = 2_000;

/**
 * Retry budget for the RPCs that drive rounds forward (timeout resolve, advance).
 * Nothing downstream re-sends them: once a round is resolved the countdown is
 * over and neither player can act, so a dropped call has to be retried here or
 * the battle stays on that question.
 */
export const BATTLE_ROUND_ACTION_RETRY_MS = 1_000;
export const BATTLE_ROUND_ACTION_MAX_RETRIES = 3;

/** A queued player older than this is dropped by `pair_battle_match`. */
export const BATTLE_QUEUE_STALE_MS = 120_000;

/** How often a waiting client re-checks matchmaking, as a realtime backstop. */
export const BATTLE_MATCH_POLL_INTERVAL_MS = 3_000;

/**
 * 人が集まらないときのボット対戦のタイミング。
 * `OFFER` を過ぎたらロビーに「ボットと対戦する」を出し、`AUTO` まで誰も
 * 見つからなければ自動でボット戦に入る（待ちっぱなしで終わらせない）。
 */
export const BATTLE_BOT_OFFER_AFTER_MS = 15_000;
export const BATTLE_BOT_AUTO_AFTER_MS = 40_000;

/**
 * ボット戦で「ボットの番」を清算しに行く間隔。Route Handler は常駐できず
 * サーバー側タイマーを持てないので、人間のクライアントが叩いてサーバーが
 * 時刻を検証する（ラウンド進行・時間切れと同じ方式）。押す時刻はサーバーが
 * 決めるので、この間隔を変えてもボットの速さは変わらない。
 */
export const BATTLE_BOT_TICK_INTERVAL_MS = 500;

/** Choices per question. The DB constrains stored indexes to this range too. */
export const BATTLE_CHOICE_COUNT = 4;

/** A battle needs at least this many usable words across both wordbooks. */
export const BATTLE_MIN_SOURCE_WORDS = 4;

export const BATTLE_INVITE_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export function clampQuestionCount(value: number): number {
  if (!Number.isFinite(value)) return BATTLE_DEFAULT_QUESTION_COUNT;
  return Math.min(BATTLE_MAX_QUESTION_COUNT, Math.max(BATTLE_MIN_QUESTION_COUNT, Math.round(value)));
}

export function clampRoundDurationMs(value: number): number {
  if (!Number.isFinite(value)) return BATTLE_DEFAULT_ROUND_DURATION_MS;
  return Math.min(
    BATTLE_MAX_ROUND_DURATION_MS,
    Math.max(BATTLE_MIN_ROUND_DURATION_MS, Math.round(value)),
  );
}

export function normalizeInviteCode(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '');
  return BATTLE_INVITE_CODE_PATTERN.test(normalized) ? normalized : null;
}
