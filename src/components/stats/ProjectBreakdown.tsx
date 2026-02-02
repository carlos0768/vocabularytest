'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { FolderOpen, BookOpen, CheckCircle2, GraduationCap } from 'lucide-react';
import { getProjectStats } from '@/lib/stats';

const COLORS = {
  mastered: '#4ade80',  // green-400
  review: '#fbbf24',    // amber-400
  new: '#e5e7eb',       // gray-200
};

export function ProjectBreakdown() {
  const projectStats = useMemo(() => getProjectStats(), []);

  const totalWords = projectStats.reduce((sum, p) => sum + p.totalWords, 0);
  const totalMastered = projectStats.reduce((sum, p) => sum + p.masteredWords, 0);
  const overallMastery = totalWords > 0 ? Math.round((totalMastered / totalWords) * 100) : 0;

  // Prepare data for pie chart
  const pieData = useMemo(() => {
    const mastered = projectStats.reduce((sum, p) => sum + p.masteredWords, 0);
    const review = projectStats.reduce((sum, p) => sum + p.reviewWords, 0);
    const newWords = projectStats.reduce((sum, p) => sum + p.newWords, 0);

    return [
      { name: '習得済み', value: mastered, color: COLORS.mastered },
      { name: '復習中', value: review, color: COLORS.review },
      { name: '新規', value: newWords, color: COLORS.new },
    ].filter(d => d.value > 0);
  }, [projectStats]);

  if (projectStats.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="w-5 h-5 text-[var(--color-primary)]" />
          <h3 className="font-bold text-[var(--color-foreground)]">プロジェクト別統計</h3>
        </div>
        <p className="text-[var(--color-muted)] text-center py-4">データがありません</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <FolderOpen className="w-5 h-5 text-[var(--color-primary)]" />
        <h3 className="font-bold text-[var(--color-foreground)]">プロジェクト別統計</h3>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-3 bg-[var(--color-peach-light)] rounded-xl text-center">
          <BookOpen className="w-5 h-5 text-[var(--color-primary)] mx-auto mb-1" />
          <p className="text-2xl font-bold text-[var(--color-primary)]">{totalWords}</p>
          <p className="text-xs text-[var(--color-muted)]">総単語数</p>
        </div>
        <div className="p-3 bg-[var(--color-peach-light)] rounded-xl text-center">
          <GraduationCap className="w-5 h-5 text-[var(--color-primary)] mx-auto mb-1" />
          <p className="text-2xl font-bold text-[var(--color-primary)]">{overallMastery}%</p>
          <p className="text-xs text-[var(--color-muted)]">総習得率</p>
        </div>
      </div>

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <div className="h-48 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
                formatter={(value, name) => [value as number, name]}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                iconType="circle"
                wrapperStyle={{ fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Project List */}
      <div className="space-y-2">
        {projectStats.slice(0, 5).map((project) => (
          <div
            key={project.projectId}
            className="flex items-center gap-3 p-3 bg-[var(--color-surface)] rounded-xl"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[var(--color-foreground)] truncate">
                {project.title}
              </p>
              <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <span>{project.totalWords}単語</span>
                <span>•</span>
                <span className="text-[var(--color-success)]">
                  {project.masteredWords}習得
                </span>
                {project.reviewWords > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-[var(--color-warning)]">
                      {project.reviewWords}復習
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Mastery Ring */}
            <div className="relative w-12 h-12 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth="4"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke={project.masteryRate >= 70 ? COLORS.mastered : 
                          project.masteryRate >= 40 ? COLORS.review : COLORS.new}
                  strokeWidth="4"
                  strokeDasharray={`${project.masteryRate * 1.26} 126`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-xs font-bold text-[var(--color-foreground)]">
                {project.masteryRate}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {projectStats.length > 5 && (
        <p className="text-center text-sm text-[var(--color-muted)] mt-3">
          他 {projectStats.length - 5} プロジェクト...
        </p>
      )}
    </div>
  );
}
