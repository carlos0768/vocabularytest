'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';

interface ProjectListItemProps {
  project: Project;
  wordCount: number;
  masteredCount?: number;
  progress?: number;
  onDelete?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
}

export function ProjectListItem({
  project,
  wordCount,
  masteredCount = 0,
  progress = 0,
  onDelete,
  onToggleFavorite,
}: ProjectListItemProps) {
  const [showMenu, setShowMenu] = useState(false);

  const safeIconImage =
    typeof project.iconImage === 'string' && project.iconImage.startsWith('data:image/')
      ? project.iconImage
      : null;

  return (
    <div className="relative flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--color-surface-hover)] transition-colors group">
      {/* Pin indicator */}
      {project.isFavorite && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[var(--color-primary)]" />
      )}

      {/* Link covers the row except the menu button */}
      <Link href={`/project/${project.id}`} prefetch={false} className="flex items-center gap-3 flex-1 min-w-0">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex items-center justify-center shrink-0">
          {safeIconImage ? (
            <span
              className="w-full h-full bg-center bg-cover block"
              style={{ backgroundImage: `url(${safeIconImage})` }}
            />
          ) : (
            <Icon name="menu_book" size={18} className="text-[var(--color-muted)]" />
          )}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
            {project.title}
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {wordCount}語 · {formatDate(project.createdAt)}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="shrink-0 flex items-center">
          {progress === 0 ? (
            <span className="text-[10px] text-[var(--color-muted)] bg-[var(--color-border-light)] px-2 py-0.5 rounded-full whitespace-nowrap">
              未学習
            </span>
          ) : progress >= 100 ? (
            <span className="text-[10px] text-[var(--color-success)] bg-[var(--color-success-light)] px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-0.5">
              <Icon name="check_circle" size={12} />
              完了
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 rounded-full bg-[var(--color-border-light)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] text-[var(--color-muted)] w-8 text-right tabular-nums">
                {Math.round(progress)}%
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* Menu button */}
      {(onDelete || onToggleFavorite) && (
        <div className="relative shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-8 h-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity data-[state=open]:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            data-state={showMenu ? 'open' : 'closed'}
          >
            <Icon name="more_vert" size={16} />
          </Button>

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
    </div>
  );
}
