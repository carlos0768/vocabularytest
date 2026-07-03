const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Returns the UTC instant corresponding to Monday 00:00 JST of the week
 * containing `now`. JST has no DST, so a fixed +9h offset is correct.
 */
export function getCurrentWeekStartUtc(now: Date = new Date()): Date {
  const jstShifted = new Date(now.getTime() + JST_OFFSET_MS);
  const jstWeekday = jstShifted.getUTCDay(); // 0=Sun..6=Sat, read as JST wall-clock weekday
  const daysSinceMonday = (jstWeekday + 6) % 7;

  const jstMidnight = new Date(Date.UTC(
    jstShifted.getUTCFullYear(),
    jstShifted.getUTCMonth(),
    jstShifted.getUTCDate() - daysSinceMonday,
  ));

  return new Date(jstMidnight.getTime() - JST_OFFSET_MS);
}
