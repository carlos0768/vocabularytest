// JST月キー('YYYY-MM')ヘルパー。財務ダッシュボードの集計は
// コインシステムと同じくJST暦月を単位とする。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstMonthKey(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// 現在月を末尾に、過去count-1ヶ月分を昇順で返す。
export function lastJstMonthKeys(count: number, now: Date): string[] {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// 'YYYY-MM' のJST月初0時をUTC Dateで返す。
export function jstMonthStartUtc(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET_MS);
}

export function daysInJstMonth(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function jstDayOfMonth(date: Date): number {
  return new Date(date.getTime() + JST_OFFSET_MS).getUTCDate();
}
