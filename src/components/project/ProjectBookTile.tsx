'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { getBookCoverColors } from '@/lib/book-cover-utils';
import type { Project } from '@/types';

interface CustomMenuItem {
  label: string;
  icon: string;
  onClick: (id: string) => void;
  danger?: boolean;
}

interface ProjectBookTileProps {
  project: Project;
  wordCount: number;
  masteredCount?: number;
  progress?: number;
  onDelete?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  extraMenuItems?: CustomMenuItem[];
}

export function ProjectBookTile({
  project,
  wordCount,
  progress = 0,
  onDelete,
  onToggleFavorite,
  extraMenuItems,
}: ProjectBookTileProps) {
  const [showMenu, setShowMenu] = useState(false);

  const safeIconImage =
    typeof project.iconImage === 'string' && project.iconImage.startsWith('data:image/')
      ? project.iconImage
      : null;

  const [colorFrom, colorTo] = getBookCoverColors(project.id);
  const clampedProgress = Math.max(0, Math.min(progress, 100));
  const isCompleted = clampedProgress >= 100 && wordCount > 0;
  const isInProgress = clampedProgress > 0 && clampedProgress < 100;

  // First character of title for the generated cover
  const initial = project.title.charAt(0).toUpperCase();

  return (
    <div className="relative group">
      {/* ⋯ menu — always visible on mobile, hover on desktop */}
      {(onDelete || onToggleFavorite || (extraMenuItems && extraMenuItems.length > 0)) && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <button
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-[var(--color-muted)] opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-white hover:text-[var(--color-foreground)]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <Icon name="more_horiz" size={16} />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--color-surface)] rounded-lg shadow-card border border-[var(--color-border)] py-1 min-w-[140px]">
                {onToggleFavorite && (
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowMenu(false);
                      onToggleFavorite(project.id);
                    }}
                  >
                    <Icon name="push_pin" size={16} filled={project.isFavorite} />
                    {project.isFavorite ? 'ピン解除' : 'ピン留め'}
                  </button>
                )}
                {extraMenuItems && extraMenuItems.map((item) => (
                  <button
                    key={item.label}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                      item.danger
                        ? 'text-[var(--color-error)] hover:bg-[var(--color-error-light)]'
                        : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
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
                {onDelete && (
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-error-light)] flex items-center gap-2"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowMenu(false);
                      onDelete(project.id);
                    }}
                  >
                    <Icon name="delete" size={16} />
                    削除
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <Link
        href={`/project/${project.id}`}
        className="block rounded-xl border-2 border-[var(--color-border)] border-b-4 bg-[var(--color-surface)] p-3 pb-2.5 active:border-b-2 active:mt-[2px] transition-all"
      >
        {/* Book cover */}
        <div className="relative mx-auto w-[72px] h-[100px] rounded-md overflow-hidden shadow-sm">
          {safeIconImage ? (
            <span
              className="block w-full h-full bg-center bg-cover"
              style={{ backgroundImage: `url(${safeIconImage})` }}
            />
          ) : (
            /* Generated book cover */
            <div
              className="w-full h-full flex flex-col items-center justify-center relative"
              style={{ background: `linear-gradient(145deg, ${colorFrom}, ${colorTo})` }}
            >
              {/* Spine edge highlight */}
              <div className="absolute left-0 inset-y-0 w-[3px] bg-black/15" />
              {/* Title initial */}
              <span className="text-white/90 text-2xl font-bold leading-none">{initial}</span>
              <span className="text-white/60 text-[16px] mt-1.5 tracking-wider">{wordCount}語</span>
            </div>
          )}

          {/* Progress (in-progress only): middle bar */}
          {isInProgress && (
            <div className="absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-2.5 rounded-full bg-black/30 border border-white/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/85"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
          )}

          {/* Completed: wrapped ribbon */}
          {isCompleted && (
            <>
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[10px] bg-[var(--color-success)]/70 pointer-events-none" />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-6 bg-[var(--color-success)]/95 border-y border-[var(--color-success)]/70 shadow-sm pointer-events-none" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/95 text-[var(--color-success)] flex items-center justify-center shadow-sm pointer-events-none">
                <Icon name="check" size={14} filled />
              </div>
            </>
          )}

          {/* Pin badge */}
          {project.isFavorite && (
            <div className="absolute top-1 left-1">
              <Icon name="push_pin" size={12} filled className="text-white drop-shadow-sm" />
            </div>
          )}
        </div>

        {/* Title */}
        <p className="mt-2.5 text-xs font-medium text-[var(--color-foreground)] text-center line-clamp-2 leading-tight min-h-[2rem]">
          {project.title}
        </p>
      </Link>
    </div>
  );
}
