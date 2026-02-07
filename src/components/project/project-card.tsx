'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';

interface ProjectCardProps {
  project: Project;
  wordCount: number;
  masteredCount?: number;
  progress?: number;
  onDelete?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
}

export function ProjectCard({ project, wordCount, masteredCount = 0, progress = 0, onDelete, onToggleFavorite }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <Card className="relative group overflow-hidden">
      <Link href={`/project/${project.id}`} className="block">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="line-clamp-2 pr-8">{project.title}</CardTitle>
            {project.isFavorite && (
              <span className="chip chip-pro text-xs flex items-center gap-1">
                <Icon name="push_pin" size={12} />
                ピン留め
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4 text-sm text-[var(--color-muted)]">
            <div className="flex items-center gap-1">
              <Icon name="menu_book" size={16} />
              <span>{wordCount}語</span>
            </div>
            <span>{formatDate(project.createdAt)}</span>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-2">
              <span>習得率</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-[var(--color-muted)]">{masteredCount}語 習得済み</p>
          </div>
        </CardContent>
      </Link>

      {/* Menu button */}
      {(onDelete || onToggleFavorite) && (
        <div className="absolute top-3 right-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-8 h-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <Icon name="more_vert" size={16} />
          </Button>

          {/* Dropdown menu */}
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
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
                    {project.isFavorite ? 'ピン留め解除' : 'ピン留め'}
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
    </Card>
  );
}
