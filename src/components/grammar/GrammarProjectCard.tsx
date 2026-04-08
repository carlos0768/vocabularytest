'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { Project, GrammarPattern } from '@/types';

const GRAMMAR_COLORS = [
  '#6366f1', // indigo
  '#0891b2', // cyan
  '#7c3aed', // violet
  '#059669', // emerald
  '#dc2626', // red
  '#d97706', // amber
];

function getGrammarColor(title: string): string {
  return GRAMMAR_COLORS[title.length % GRAMMAR_COLORS.length];
}

interface GrammarProjectCardProps {
  project: Project;
  patterns: GrammarPattern[];
}

export function GrammarProjectCard({ project, patterns }: GrammarProjectCardProps) {
  const total = patterns.length;
  const mastered = patterns.filter((p) => p.repetition >= 3).length;
  const reviewing = patterns.filter((p) => p.repetition > 0 && p.repetition < 3).length;
  const unlearned = total - mastered - reviewing;

  const iconColor = getGrammarColor(project.title);

  return (
    <Link
      href={`/grammar/${project.id}`}
      className="card p-4 flex items-center gap-4 active:opacity-80 transition-opacity"
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: iconColor }}
      >
        <Icon name="school" size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[var(--color-foreground)] truncate">{project.title}</p>
        <p className="text-xl font-black text-[var(--color-foreground)]">
          {total} <span className="text-sm font-bold">パターン</span>
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-[var(--color-success)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
            習得 {mastered}
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-muted)]" />
            学習 {reviewing}
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-border)]" />
            未学習 {unlearned}
          </span>
        </div>
      </div>
    </Link>
  );
}
