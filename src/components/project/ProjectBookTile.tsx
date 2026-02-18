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
  const hasProgress = clampedProgress > 0 && wordCount > 0;

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
        className={`block rounded-xl border-2 border-b-4 bg-[var(--color-surface)] p-3 pb-2.5 active:border-b-2 active:mt-[2px] transition-all ${
          hasProgress
            ? 'border-[var(--color-success)]'
            : 'border-[var(--color-border)]'
        }`}
      >
        {/* Book cover */}
        <div className="relative mx-auto w-[64px] h-[90px] rounded-md overflow-hidden shadow-sm">
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
              <span className="text-white/90 text-xl font-bold leading-none">{initial}</span>
              <span className="text-white/60 text-[14px] mt-1 tracking-wider">{wordCount}語</span>
            </div>
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
