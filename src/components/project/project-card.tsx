'use client';

import Link from 'next/link';
import { BookOpen, Trash2, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';

interface ProjectCardProps {
  project: Project;
  wordCount: number;
  onDelete: (id: string) => void;
}

export function ProjectCard({ project, wordCount, onDelete }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <Card className="relative group">
      <Link href={`/project/${project.id}`} className="block">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="line-clamp-2 pr-8">{project.title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <BookOpen className="w-4 h-4" />
              <span>{wordCount}語</span>
            </div>
            <span>{formatDate(project.createdAt)}</span>
          </div>
        </CardContent>
      </Link>

      {/* Menu button */}
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
          <MoreVertical className="w-4 h-4" />
        </Button>

        {/* Dropdown menu */}
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px]">
              <button
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete(project.id);
                }}
              >
                <Trash2 className="w-4 h-4" />
                削除
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
