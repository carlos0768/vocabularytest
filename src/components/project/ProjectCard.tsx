'use client';

import Link from 'next/link';
import type { Project, Word } from '@/types';

interface ProjectCardBaseProps {
  project: Project;
}

interface ProjectCardWithWords extends ProjectCardBaseProps {
  words: Word[];
  totalWords?: never;
  masteredWords?: never;
}

interface ProjectCardWithCounts extends ProjectCardBaseProps {
  words?: never;
  totalWords: number;
  masteredWords: number;
}

export type ProjectCardProps = ProjectCardWithWords | ProjectCardWithCounts;

const ICON_COLORS = ['bg-red-500', 'bg-green-600', 'bg-blue-900', 'bg-orange-500', 'bg-purple-600', 'bg-teal-600'];

export function ProjectCard(props: ProjectCardProps) {
  const { project } = props;

  let total: number;
  let mastered: number;
  let learning: number;
  let unlearned: number;

  if (props.words) {
    total = props.words.length;
    mastered = props.words.filter((w) => w.status === 'mastered').length;
    learning = props.words.filter((w) => w.status === 'review').length;
    unlearned = props.words.filter((w) => !w.status || w.status === 'new').length;
  } else {
    total = props.totalWords;
    mastered = props.masteredWords;
    unlearned = Math.max(0, total - mastered);
    learning = 0;
  }

  const colorIndex = project.title.length % ICON_COLORS.length;

  return (
    <Link
      href={`/project/${project.id}`}
      className="card p-4 flex items-center gap-4 active:opacity-80 transition-opacity"
    >
      <div
        className={`w-14 h-14 rounded-xl ${ICON_COLORS[colorIndex]} flex items-center justify-center text-white text-xl font-bold shrink-0`}
      >
        {project.title.charAt(0) === 'ス' ? 'ス' : project.title.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[var(--color-foreground)] truncate">{project.title}</p>
        <p className="text-xl font-black text-[var(--color-foreground)]">
          {total} <span className="text-sm font-bold">語</span>
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-[var(--color-success)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
            習得 {mastered}
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-muted)]" />
            学習 {learning}
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
