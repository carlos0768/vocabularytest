'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { TrendingUp, Target } from 'lucide-react';
import { getLearningTrend, getWeeklyAccuracyTrend } from '@/lib/stats';

export function LearningChart() {
  const dailyData = useMemo(() => getLearningTrend(30), []);
  const weeklyData = useMemo(() => getWeeklyAccuracyTrend(), []);

  const totalQuiz = dailyData.reduce((sum, d) => sum + d.quizCount, 0);
  const totalCorrect = dailyData.reduce((sum, d) => sum + d.correctCount, 0);
  const avgAccuracy = totalQuiz > 0 ? Math.round((totalCorrect / totalQuiz) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Daily Activity Chart */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-[var(--color-primary)]" />
          <h3 className="font-bold text-[var(--color-foreground)]">学習推移（30日間）</h3>
        </div>
        
        <div className="h-48 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="quizGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                interval={4}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
                formatter={(value, name) => {
                  const numValue = value as number;
                  if (name === 'quizCount') return [`${numValue}問`, '回答数'];
                  if (name === 'accuracy') return [`${numValue}%`, '正答率'];
                  return [numValue, name];
                }}
              />
              <Area
                type="monotone"
                dataKey="quizCount"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#quizGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-[var(--color-peach-light)] rounded-xl">
            <p className="text-2xl font-bold text-[var(--color-primary)]">{totalQuiz}</p>
            <p className="text-xs text-[var(--color-muted)]">総回答数</p>
          </div>
          <div className="text-center p-3 bg-[var(--color-peach-light)] rounded-xl">
            <p className="text-2xl font-bold text-[var(--color-primary)]">{avgAccuracy}%</p>
            <p className="text-xs text-[var(--color-muted)]">平均正答率</p>
          </div>
          <div className="text-center p-3 bg-[var(--color-peach-light)] rounded-xl">
            <p className="text-2xl font-bold text-[var(--color-primary)]">
              {dailyData.filter(d => d.quizCount > 0).length}
            </p>
            <p className="text-xs text-[var(--color-muted)]">学習日数</p>
          </div>
        </div>
      </div>

      {/* Weekly Accuracy Trend */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-[var(--color-primary)]" />
          <h3 className="font-bold text-[var(--color-foreground)]">週次正答率推移</h3>
        </div>
        
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis 
                dataKey="weekLabel" 
                tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                domain={[0, 100]}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
                formatter={(value) => [`${value as number}%`, '正答率']}
              />
              <Line
                type="monotone"
                dataKey="accuracy"
                stroke="var(--color-peach)"
                strokeWidth={3}
                dot={{ fill: 'var(--color-peach)', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: 'var(--color-primary)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
