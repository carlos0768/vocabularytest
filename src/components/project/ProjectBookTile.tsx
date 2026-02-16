'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';

interface ProjectBookTileProps {
  project: Project;
  wordCount: number;
  masteredCount?: number;
  progress?: number;
  onDelete?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
}

/** Color palette for generated book covers (when no iconImage) */
const COVER_COLORS = [
  ['#3b82f6', '#2563eb'], // blue
  ['#8b5cf6', '#7c3aed'], // violet
  ['#06b6d4', '#0891b2'], // cyan
  ['#10b981', '#059669'], // emerald
  ['#f59e0b', '#d97706'], // amber
  ['#ef4444', '#dc2626'], // red
  ['#ec4899', '#db2777'], // pink
  ['#6366f1', '#4f46e5'], // indigo
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function ProjectBookTile({
  project,
  wordCount,
  progress = 0,
  onDelete,
  onToggleFavorite,
}: ProjectBookTileProps) {
  const [showMenu, setShowMenu] = useState(false);

  const safeIconImage =
    typeof project.iconImage === 'string' && project.iconImage.startsWith('data:image/')
      ? project.iconImage
      : null;

  const colorIdx = hashCode(project.id) % COVER_COLORS.length;
  const [colorFrom, colorTo] = COVER_COLORS[colorIdx];

  // First character of title for the generated cover
  const initial = project.title.charAt(0).toUpperCase();

  return (
    <div className="relative group">
      {/* ⋯ menu — always visible on mobile, hover on desktop */}
      {(onDelete || onToggleFavorite) && (
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
        className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 pb-2.5 hover:shadow-card hover:border-[var(--color-border-light)] transition-all"
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
              <span className="text-white/60 text-[8px] mt-1.5 tracking-wider">{wordCount}語</span>
            </div>
          )}

          {/* Progress strip at bottom of cover */}
          {progress > 0 && progress < 100 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
              <div
                className="h-full bg-white/80"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          {progress >= 100 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--color-success)]" />
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
