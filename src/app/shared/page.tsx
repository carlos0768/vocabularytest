'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell, Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';

interface SharedProject {
  id: string;
  title: string;
  wordCount: number;
  memberCount: number;
  shareCode: string;
  isOwner: boolean;
  createdAt: string;
}

export default function SharedPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    fetch('/api/shared-projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.projects)) {
          setProjects(data.projects);
        }
      })
      .catch((err) => {
        console.error('Failed to load shared projects:', err);
      })
      .finally(() => setLoading(false));
  }, [authLoading, isAuthenticated]);

  const iconColors = ['bg-red-500', 'bg-green-600', 'bg-blue-900', 'bg-orange-500', 'bg-purple-600', 'bg-teal-600'];

  return (
    <AppShell>
      <div className="min-h-screen pb-24 lg:pb-6">
        <header className="px-5 pt-6 pb-4">
          <div className="max-w-lg mx-auto">
            <h1 className="text-3xl font-black text-[var(--color-foreground)] text-center">共有</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-5 pb-4">
          {!isAuthenticated && !authLoading ? (
            <div className="text-center py-16">
              <Icon name="lock" size={48} className="text-[var(--color-muted)] mx-auto mb-4" />
              <p className="text-[var(--color-foreground)] font-bold mb-2">ログインが必要です</p>
              <p className="text-sm text-[var(--color-muted)] mb-6">共有機能を使うにはログインしてください。</p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-foreground)] text-white font-semibold"
              >
                ログイン
              </Link>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-[var(--color-foreground)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-[var(--color-muted)]">公開単語帳</p>
                <p className="text-sm text-[var(--color-muted)]">{projects.length}件</p>
              </div>

              {projects.length === 0 ? (
                <div className="text-center py-16">
                  <Icon name="share" size={48} className="text-[var(--color-muted)] mx-auto mb-4" />
                  <p className="text-[var(--color-foreground)] font-bold mb-2">共有単語帳はありません</p>
                  <p className="text-sm text-[var(--color-muted)]">単語帳を共有するとここに表示されます。</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => {
                    const colorIndex = project.title.length % iconColors.length;
                    return (
                      <Link
                        key={project.id}
                        href={`/project/${project.id}`}
                        className="card p-4 flex items-center gap-4 active:opacity-80 transition-opacity"
                      >
                        <div className={`w-14 h-14 rounded-xl ${iconColors[colorIndex]} flex items-center justify-center text-white text-xl font-bold shrink-0`}>
                          {project.title.charAt(0) === 'ス' ? 'ス' : project.title.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[var(--color-foreground)] truncate">{project.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-muted)]">
                            <span className="flex items-center gap-1">
                              <Icon name="description" size={14} />
                              {project.wordCount}語
                            </span>
                            <span className="flex items-center gap-1">
                              <Icon name="group" size={14} />
                              {project.memberCount}人
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-semibold border border-green-200">
                          公開中
                        </span>
                        <Icon name="chevron_right" size={20} className="text-[var(--color-muted)] shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </AppShell>
  );
}
