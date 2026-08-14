/** Shared tuning constants for リアルタイム単語対戦. */

export const BATTLE_DEFAULT_QUESTION_COUNT = 10;
export const BATTLE_MIN_QUESTION_COUNT = 3;
export const BATTLE_MAX_QUESTION_COUNT = 30;

export const BATTLE_DEFAULT_ROUND_DURATION_MS = 15_000;
export const BATTLE_MIN_ROUND_DURATION_MS = 3_000;
export const BATTLE_MAX_ROUND_DURATION_MS = 60_000;

/** How long the result of a resolved round stays on screen before advancing. */
export const BATTLE_ROUND_REVEAL_MS = 2_000;

/** A queued player older than this is dropped by `pair_battle_match`. */
export const BATTLE_QUEUE_STALE_MS = 120_000;

/** How often a waiting client re-checks matchmaking, as a realtime backstop. */
export const BATTLE_MATCH_POLL_INTERVAL_MS = 3_000;

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
