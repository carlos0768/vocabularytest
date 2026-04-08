'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { Project, Word } from '@/types';

interface MenuItem {
  label: string;
  icon: string;
  onClick: (id: string) => void;
  danger?: boolean;
}

interface ProjectCardBaseProps {
  project: Project;
  menuItems?: MenuItem[];
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

export const PROJECT_COLORS = [
  '#ef4444', // red
  '#16a34a', // green
  '#1e3a8a', // blue-900
  '#f97316', // orange
  '#9333ea', // purple
  '#0d9488', // teal
];

export function getProjectColor(title: string): string {
  return PROJECT_COLORS[title.length % PROJECT_COLORS.length];
}

export function ProjectCard(props: ProjectCardProps) {
  const { project, menuItems } = props;
  const [showMenu, setShowMenu] = useState(false);

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

  const iconColor = getProjectColor(project.title);

  return (
    <div className="relative">
      <Link
        href={`/project/${project.id}`}
        prefetch={true}
        className="card p-4 flex items-center gap-4 active:opacity-80 transition-opacity"
      >
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold shrink-0"
          style={{ backgroundColor: iconColor }}
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
        {menuItems && menuItems.length > 0 && (
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface-secondary)] transition-colors shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu((v) => !v);
            }}
          >
            <Icon name="more_vert" size={18} />
          </button>
        )}
      </Link>

      {showMenu && menuItems && menuItems.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-2 top-12 z-20 bg-[var(--color-surface)] rounded-xl shadow-card border border-[var(--color-border)] py-1 min-w-[160px]">
            {menuItems.map((item) => (
              <button
                key={item.label}
                className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 ${
                  item.danger
                    ? 'text-[var(--color-error)] hover:bg-[var(--color-error-light)]'
                    : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-secondary)]'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMenu(false);
                  item.onClick(project.id);
                }}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
