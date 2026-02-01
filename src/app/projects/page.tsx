'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, FolderOpen, Calendar, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/ui/bottom-nav';
import { getRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import type { Project, Word, SubscriptionStatus } from '@/types';

interface ProjectWithStats extends Project {
  wordCount: number;
  masteredCount: number;
  updatedAt?: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, subscription, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  useEffect(() => {
    if (authLoading) return;

    const loadProjects = async () => {
      try {
        const userId = user?.id || 'local';
        const data = await repository.getProjects(userId);
        
        // Load word counts for each project
        const projectsWithStats: ProjectWithStats[] = await Promise.all(
          data.map(async (project) => {
            const words = await repository.getWords(project.id);
            const masteredCount = words.filter(w => w.status === 'mastered').length;
            return {
              ...project,
              wordCount: words.length,
              masteredCount,
              updatedAt: words.length > 0 
                ? words.reduce((latest, w) => {
                    const wDate = w.lastReviewedAt || w.createdAt;
                    return wDate > latest ? wDate : latest;
                  }, project.createdAt)
                : project.createdAt,
            };
          })
        );
        
        setProjects(projectsWithStats);
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [authLoading, user, repository]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(p => p.title.toLowerCase().includes(query));
  }, [projects, searchQuery]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '今日';
    if (diffDays === 1) return '昨日';
    if (diffDays < 7) return `${diffDays}日前`;
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 backdrop-blur-sm border-b border-[var(--color-border)]">
        <div className="max-w-lg mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
              プロジェクト
            </h1>
            <Button
              onClick={() => router.push('/?action=scan')}
              size="sm"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              新規作成
            </Button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-muted)]" />
            <input
              type="text"
              placeholder="プロジェクトを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            />
          </div>
        </div>
      </header>

      {/* Project list */}
      <main className="max-w-lg mx-auto px-6 py-4">
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-[var(--color-peach-light)] rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-10 h-10 text-[var(--color-primary)]" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
              {searchQuery ? 'プロジェクトが見つかりません' : 'プロジェクトがありません'}
            </h2>
            <p className="text-[var(--color-muted)] mb-6">
              {searchQuery ? '検索条件を変更してください' : '写真をスキャンして単語帳を作成しましょう'}
            </p>
            {!searchQuery && (
              <Button onClick={() => router.push('/?action=scan')}>
                <Plus className="w-5 h-5 mr-2" />
                最初のプロジェクトを作成
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/project/${project.id}`)}
                className="w-full p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl text-left hover:border-[var(--color-primary)] hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors line-clamp-1">
                    {project.title}
                  </h3>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-[var(--color-muted)]">
                  <div className="flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    <span>{project.wordCount}語</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(project.updatedAt || project.createdAt)}</span>
                  </div>
                </div>

                {/* Progress bar */}
                {project.wordCount > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-1">
                      <span>習得進捗</span>
                      <span>{Math.round(project.masteredCount / project.wordCount * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-peach)] rounded-full transition-all"
                        style={{ width: `${Math.round(project.masteredCount / project.wordCount * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
