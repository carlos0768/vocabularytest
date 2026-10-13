/** JST は UTC+9 固定（サマータイム無し）なので単純な加算で足りる。 */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const DAY_MS = 86_400_000;

/** `date` が属する JST 暦日のキー（YYYY-MM-DD）。 */
export function jstDayKey(date: Date = new Date()): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `date` が属する JST 暦日の 0:00 を UTC の ISO 文字列で返す。 */
export function jstDayStartIso(date: Date = new Date()): string {
  const jstMidnight = Math.floor((date.getTime() + JST_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(jstMidnight - JST_OFFSET_MS).toISOString();
}
