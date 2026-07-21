// 財務ダッシュボード共通のフォーマッタ(会計表記: 負値は▲)

export function formatYen(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatAccounting(value: number, fractionDigits = 0): string {
  const formatted = new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
  return value < 0 ? `▲${formatted}` : formatted;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

export function formatPercent(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${year}年${Number(month)}月`;
}

export function shortMonthLabel(monthKey: string, index: number): string {
  const [year, month] = monthKey.split('-');
  if (index === 0 || month === '01') {
    return `${year.slice(2)}/${Number(month)}`;
  }
  return `${Number(month)}月`;
}
