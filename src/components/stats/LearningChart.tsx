'use client';

import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { getLearningTrend } from '@/lib/stats';

export function LearningChart() {
  const data = useMemo(() => getLearningTrend(30), []);

  const maxQuiz = useMemo(() => Math.max(...data.map(d => d.quizCount), 1), [data]);
  const totalQuizzes = useMemo(() => data.reduce((sum, d) => sum + d.quizCount, 0), [data]);

  if (totalQuizzes === 0) {
    return (
      <div className="card p-5">
        <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[var(--color-primary)]" />
          学習推移（30日間）
        </h2>
        <div className="flex items-center justify-center py-8 text-[var(--color-muted)] text-sm">
          まだ学習データがありません
        </div>
      </div>
    );
  }

  // Show every 5th label to avoid crowding
  const tickIndices = new Set<number>();
  for (let i = 0; i < data.length; i += 5) {
    tickIndices.add(i);
  }
  tickIndices.add(data.length - 1);

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-[var(--color-primary)]" />
        学習推移（30日間）
      </h2>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="quizGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
              tickLine={false}
              axisLine={false}
              domain={[0, Math.ceil(maxQuiz * 1.1)]}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                fontSize: '12px',
              }}
              formatter={(value?: number, name?: string) => {
                if (name === 'quizCount') return [value ?? 0, '回答数'];
                return [value ?? 0, name ?? ''];
              }}
              labelFormatter={(label) => `${label}`}
            />
            <Area
              type="monotone"
              dataKey="quizCount"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#quizGradient)"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-primary)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary */}
      <div className="flex justify-between mt-3 text-xs text-[var(--color-muted)]">
        <span>合計 {totalQuizzes} 問</span>
        <span>日平均 {Math.round(totalQuizzes / 30)} 問</span>
      </div>
    </div>
  );
}
