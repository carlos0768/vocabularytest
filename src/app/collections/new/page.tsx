'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { useCollections } from '@/hooks/use-collections';
import { remoteRepository } from '@/lib/db/remote-repository';
import type { Project } from '@/types';

export default function NewCollectionPage() {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const { createCollection, addProjectsToCollection } = useCollections();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [saving, setSaving] = useState(false);

  // Redirect free users
  useEffect(() => {
    if (!authLoading && !isPro) {
      router.replace('/subscription');
    }
  }, [authLoading, isPro, router]);

  // Load user's projects
  useEffect(() => {
    if (!user || authLoading) return;
    (async () => {
      try {
        const data = await remoteRepository.getProjects(user.id);
        setProjects(data);
      } catch (e) {
        console.error('Failed to load projects:', e);
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, [user, authLoading]);

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const collection = await createCollection(name.trim(), description.trim() || undefined);
      if (!collection) {
        showToast({ message: '作成に失敗しました', type: 'error' });
        return;
      }

      // Add selected projects
      if (selectedIds.size > 0) {
        await addProjectsToCollection(collection.id, Array.from(selectedIds));
      }

      showToast({ message: 'プロジェクトを作成しました', type: 'success' });
      router.replace(`/collections/${collection.id}`);
    } catch (e) {
      console.error('Failed to create collection:', e);
      showToast({ message: '作成に失敗しました', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !isPro) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1 -ml-1">
            <Icon name="arrow_back" size={22} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="flex-1 text-lg font-bold text-[var(--color-foreground)]">新しいプロジェクト</h1>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-1.5 rounded-full bg-[var(--color-success)] text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
          >
            {saving ? (
              <Icon name="progress_activity" size={16} className="animate-spin" />
            ) : (
              '作成'
            )}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-[var(--color-foreground)]">プロジェクト名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：学期末試験"
            className="w-full px-4 py-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-success)] text-[var(--color-foreground)]"
            autoFocus
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-[var(--color-foreground)]">
            説明<span className="text-[var(--color-muted)] font-normal ml-1">（任意）</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例：12月の期末試験で出題される範囲"
            rows={3}
            className="w-full px-4 py-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-success)] text-[var(--color-foreground)] resize-none"
          />
        </div>

        {/* Project selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-[var(--color-foreground)]">含める単語帳</label>
            <span className="text-xs text-[var(--color-muted)]">{selectedIds.size}件選択</span>
          </div>

          {loadingProjects ? (
            <div className="flex items-center justify-center py-8 text-[var(--color-muted)]">
              <Icon name="progress_activity" size={20} className="animate-spin" />
              <span className="ml-2">単語帳を読み込み中...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="card p-4 text-center text-sm text-[var(--color-muted)]">
              単語帳がありません。まずスキャンから単語帳を作成してください。
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => {
                const selected = selectedIds.has(project.id);
                return (
                  <button
                    key={project.id}
                    onClick={() => toggleProject(project.id)}
                    className={`w-full card p-3 flex items-center gap-3 text-left transition-all ${
                      selected
                        ? 'border-[var(--color-success)] bg-[var(--color-success)]/5'
                        : ''
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected
                          ? 'bg-[var(--color-success)] border-[var(--color-success)]'
                          : 'border-[var(--color-border)]'
                      }`}
                    >
                      {selected && <Icon name="check" size={14} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{project.title}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {new Date(project.createdAt).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
