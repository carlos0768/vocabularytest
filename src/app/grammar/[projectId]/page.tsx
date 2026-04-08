'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Icon, useToast } from '@/components/ui';
import { getDb } from '@/lib/db/dexie';
import type { Project, GrammarPattern } from '@/types';

export default function GrammarProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const [, startTransition] = useTransition();
  const { showToast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [patterns, setPatterns] = useState<GrammarPattern[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const db = getDb();
        const proj = await db.projects.get(projectId);
        if (!proj) {
          showToast({ message: 'プロジェクトが見つかりません', type: 'error' });
          startTransition(() => { router.replace('/'); });
          return;
        }
        setProject(proj);

        const patternList = await db.grammarPatterns.where('projectId').equals(projectId).toArray();
        patternList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setPatterns(patternList);
      } catch (e) {
        console.error('Failed to load grammar project:', e);
        showToast({ message: '読み込みに失敗しました', type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId, router, showToast, startTransition]);

  const levelLabel = (level: string) => level === '1' ? '1級' : '準1級';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) return null;

  const mastered = patterns.filter((p) => p.repetition >= 3).length;
  const reviewing = patterns.filter((p) => p.repetition > 0 && p.repetition < 3).length;
  const unlearned = patterns.length - mastered - reviewing;

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col pb-28">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => { startTransition(() => { router.back(); }); }}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--color-surface-secondary)]"
          >
            <Icon name="arrow_back" size={22} />
          </button>
          <h1 className="text-lg font-bold text-[var(--color-foreground)] truncate max-w-[60%]">{project.title}</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-lg mx-auto px-4 py-4 w-full">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-2xl font-black text-[var(--color-foreground)]">
              {patterns.length} <span className="text-sm font-bold">パターン</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)]" />
              習得 {mastered}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-warning,#f59e0b)]" />
              学習中 {reviewing}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-border)]" />
              未学習 {unlearned}
            </span>
          </div>
        </div>
      </div>

      {/* Pattern list */}
      <main className="flex-1 max-w-lg mx-auto px-4 w-full space-y-3">
        {patterns.map((pattern) => (
          <div key={pattern.id} className="card p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[var(--color-foreground)]">{pattern.patternName}</h3>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  pattern.level === '1'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {levelLabel(pattern.level)}
                </span>
              </div>
              {pattern.repetition >= 3 && (
                <Icon name="check_circle" size={18} className="text-[var(--color-success)] shrink-0" filled />
              )}
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-2">{pattern.patternNameEn}</p>

            {/* Structure formula */}
            <div className="bg-[var(--color-surface-secondary)] rounded-lg px-3 py-2 mb-2">
              <p className="text-xs font-mono text-[var(--color-foreground)]">{pattern.structure}</p>
            </div>

            <p className="text-xs text-[var(--color-muted)] line-clamp-2 mb-2">{pattern.explanation}</p>

            {/* Example */}
            <div className="border-l-2 border-[var(--color-primary)] pl-3">
              <p className="text-xs text-[var(--color-foreground)] italic">{pattern.example}</p>
              <p className="text-xs text-[var(--color-muted)]">{pattern.exampleJa}</p>
            </div>

            <p className="text-xs text-[var(--color-primary)] mt-2 font-semibold">
              問題 {pattern.quizQuestions.length}問
            </p>
          </div>
        ))}
      </main>

      {/* Bottom action bar */}
      {patterns.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] px-5 py-3 z-40 lg:ml-[280px]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="max-w-lg mx-auto">
            <Link
              href={`/grammar/drill/${projectId}`}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--color-foreground)] text-white font-bold text-sm active:scale-[0.98] transition-transform"
            >
              <Icon name="play_arrow" size={20} />
              学習開始
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
