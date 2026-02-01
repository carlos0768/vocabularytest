'use client';

import { useMemo } from 'react';
import { FolderOpen } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { getProjectStats } from '@/lib/stats';

const COLORS = [
  'var(--color-primary)',
  'var(--color-peach)',
  'var(--color-success)',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
];

export function ProjectBreakdown() {
  const projectStats = useMemo(() => getProjectStats(), []);

  if (projectStats.length === 0) {
    return (
      <div className="card p-5">
        <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-[var(--color-primary)]" />
          プロジェクト別統計
        </h2>
        <div className="flex items-center justify-center py-8 text-[var(--color-muted)] text-sm">
          プロジェクトがありません
        </div>
      </div>
    );
  }

  // Truncate long titles for chart
  const chartData = projectStats.slice(0, 6).map(p => ({
    ...p,
    shortTitle: p.title.length > 8 ? p.title.slice(0, 7) + '…' : p.title,
  }));

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
        <FolderOpen className="w-5 h-5 text-[var(--color-primary)]" />
        プロジェクト別統計
      </h2>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="h-40 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="shortTitle"
                tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
                formatter={(value: number | undefined) => [value ?? 0, '単語数']}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="totalWords" radius={[6, 6, 0, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Project list with mastery */}
      <div className="space-y-3">
        {projectStats.map((project, index) => (
          <div key={project.projectId} className="space-y-1">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-sm text-[var(--color-foreground)] truncate">
                  {project.title}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-[var(--color-muted)]">
                  {project.masteredWords}/{project.totalWords}
                </span>
                <span className="text-xs font-semibold text-[var(--color-primary)]">
                  {project.masteryRate}%
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-[var(--color-peach-light)] rounded-full overflow-hidden ml-4">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${project.masteryRate}%`,
                  backgroundColor: COLORS[index % COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
