'use client';

/**
 * 学習度の内訳バー (習得 / 定着中 / 学習中 / 未学習)。
 * 単語帳詳細 (/project/[id]) と単語一覧 (/words) で共用する。
 * カード枠は持たず、置かれた場所の背景の上にそのまま並ぶ。
 */

export function StackedBar({ total, m, a, l, n }: { total: number; m: number; a: number; l: number; n: number }) {
  const pctM = total ? (m / total) * 100 : 0;
  const pctA = total ? (a / total) * 100 : 0;
  const pctL = total ? (l / total) * 100 : 0;
  const pctN = total ? (n / total) * 100 : 0;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-white">
        <div style={{ width: `${pctM}%`, background: 'var(--color-success)' }} />
        <div style={{ width: `${pctA}%`, background: '#2563eb' }} />
        <div style={{ width: `${pctL}%`, background: 'var(--color-warning)' }} />
        <div style={{ width: `${pctN}%`, background: 'rgba(26,26,26,0.12)' }} />
      </div>
      <div className="mt-[7px] flex flex-wrap gap-3.5 font-[var(--font-body)]">
        <BarDot color="var(--color-success)" label="習得" count={m} />
        <BarDot color="#2563eb" label="定着中" count={a} />
        <BarDot color="var(--color-warning)" label="学習中" count={l} />
        <BarDot color="rgba(26,26,26,0.35)" label="未学習" count={n} />
      </div>
    </div>
  );
}

export function BarDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-[5px]">
      <span className="h-[7px] w-[7px] rounded-[3.5px]" style={{ background: color }} />
      <span className="text-[11px] font-semibold text-[#4a4a4a]">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">{count}</span>
    </span>
  );
}
