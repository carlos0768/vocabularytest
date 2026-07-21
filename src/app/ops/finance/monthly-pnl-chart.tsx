'use client';

import { useState } from 'react';
import type { FinanceMonthlyRow } from '@/lib/finance/summary';
import { formatAccounting, formatMonthLabel, shortMonthLabel } from './format';

// 月次の純売上高・総費用(バー)と営業損益(ライン)を1軸で描くSVGチャート。
// 系列色は page.tsx の .finance-viz スコープで定義した検証済みパレット
// (--fin-revenue / --fin-cost / --fin-profit)を参照する。

function niceScale(minInput: number, maxInput: number, tickCount = 5) {
  const min = Math.min(minInput, 0);
  let max = Math.max(maxInput, 0);
  if (min === max) {
    max = min + 1;
  }
  const step0 = (max - min) / Math.max(1, tickCount - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(step0)));
  const normalized = step0 / magnitude;
  const step =
    (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return { niceMin, niceMax, ticks };
}

function compactYenTick(value: number): string {
  if (Math.abs(value) >= 10000) {
    return `${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(value / 10000)}万`;
  }
  return new Intl.NumberFormat('ja-JP').format(value);
}

// 上端のみ4px角丸・ベースライン側は直角のバー(データ端だけを丸める)
function roundedTopBarPath(x: number, yTop: number, width: number, yBase: number): string {
  const height = yBase - yTop;
  if (height <= 0) return '';
  const r = Math.min(4, width / 2, height);
  return [
    `M ${x} ${yBase}`,
    `L ${x} ${yTop + r}`,
    `Q ${x} ${yTop} ${x + r} ${yTop}`,
    `L ${x + width - r} ${yTop}`,
    `Q ${x + width} ${yTop} ${x + width} ${yTop + r}`,
    `L ${x + width} ${yBase}`,
    'Z',
  ].join(' ');
}

export function MonthlyPnlChart({ monthly }: { monthly: FinanceMonthlyRow[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const H = 280;
  const MT = 20;
  const MB = 34;
  const ML = 64;
  const MR = 24;
  const bandW = 92;
  const barW = 24;
  const n = monthly.length;
  const W = ML + MR + bandW * n;
  const innerH = H - MT - MB;

  const values = monthly.flatMap((row) => [
    row.revenue.netJpy,
    row.costs.totalJpy,
    row.profit.operatingJpy,
  ]);
  const { niceMin, niceMax, ticks } = niceScale(Math.min(...values, 0), Math.max(...values, 0));
  const y = (v: number) => MT + ((niceMax - v) / (niceMax - niceMin)) * innerH;
  const yZero = y(0);

  const centers = monthly.map((_, i) => ML + i * bandW + bandW / 2);
  const active = activeIndex !== null ? monthly[activeIndex] : null;

  return (
    <div>
      {/* 凡例(3系列) */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: 'var(--fin-revenue)' }} />
          純売上高
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: 'var(--fin-cost)' }} />
          総費用(変動費+固定費)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--fin-profit)' }} />
          営業損益
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="relative" style={{ width: W }}>
          <svg
            width={W}
            height={H}
            role="img"
            aria-label="月次の純売上高・総費用・営業損益の推移(詳細は下の損益計算書を参照)"
            onMouseLeave={() => setActiveIndex(null)}
          >
            {/* グリッド線+Y軸ラベル */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={ML}
                  x2={W - MR}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={tick === 0 ? 'var(--color-muted)' : 'var(--color-border)'}
                  strokeWidth={1}
                />
                <text
                  x={ML - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--color-muted)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {compactYenTick(tick)}
                </text>
              </g>
            ))}

            {/* ホバー中の月の帯 */}
            {activeIndex !== null && (
              <rect
                x={ML + activeIndex * bandW}
                y={MT}
                width={bandW}
                height={innerH}
                fill="var(--color-border)"
                opacity={0.25}
              />
            )}

            {/* バー(売上・費用) + 月ラベル */}
            {monthly.map((row, i) => {
              const startX = ML + i * bandW + (bandW - (barW * 2 + 2)) / 2;
              return (
                <g key={row.monthKey}>
                  <path
                    d={roundedTopBarPath(startX, y(row.revenue.netJpy), barW, yZero)}
                    fill="var(--fin-revenue)"
                  />
                  <path
                    d={roundedTopBarPath(startX + barW + 2, y(row.costs.totalJpy), barW, yZero)}
                    fill="var(--fin-cost)"
                  />
                  <text
                    x={ML + i * bandW + bandW / 2}
                    y={H - MB + 18}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--color-muted)"
                  >
                    {shortMonthLabel(row.monthKey, i)}
                  </text>
                </g>
              );
            })}

            {/* 営業損益ライン+マーカー(サーフェス色の2pxリング) */}
            <polyline
              points={monthly.map((row, i) => `${centers[i]},${y(row.profit.operatingJpy)}`).join(' ')}
              fill="none"
              stroke="var(--fin-profit)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {monthly.map((row, i) => (
              <circle
                key={row.monthKey}
                cx={centers[i]}
                cy={y(row.profit.operatingJpy)}
                r={4.5}
                fill="var(--fin-profit)"
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            ))}
            {/* 直近月の営業損益のみ直接ラベル(残りはツールチップと表が担う) */}
            {n > 0 && (
              <text
                x={centers[n - 1]}
                y={y(monthly[n - 1].profit.operatingJpy) - 12}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="var(--color-foreground)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatAccounting(monthly[n - 1].profit.operatingJpy)}
              </text>
            )}

            {/* ホバー/タップ検知の帯 */}
            {monthly.map((row, i) => (
              <rect
                key={row.monthKey}
                x={ML + i * bandW}
                y={MT}
                width={bandW}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => setActiveIndex((current) => (current === i ? null : i))}
              />
            ))}
          </svg>

          {active && activeIndex !== null && (
            <div
              className="pointer-events-none absolute top-1 z-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs shadow-lg"
              style={{
                left: Math.min(Math.max(centers[activeIndex], 110), W - 110),
                transform: 'translateX(-50%)',
              }}
            >
              <div className="mb-1 font-bold text-[var(--color-foreground)]">
                {formatMonthLabel(active.monthKey)}
              </div>
              <div className="space-y-0.5 text-[var(--color-foreground)]">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--fin-revenue)' }} />
                  純売上高 <span className="ml-auto pl-3 font-mono tabular-nums">{formatAccounting(active.revenue.netJpy)}円</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--fin-cost)' }} />
                  総費用 <span className="ml-auto pl-3 font-mono tabular-nums">{formatAccounting(active.costs.totalJpy)}円</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--fin-profit)' }} />
                  営業損益 <span className="ml-auto pl-3 font-mono tabular-nums">{formatAccounting(active.profit.operatingJpy)}円</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
